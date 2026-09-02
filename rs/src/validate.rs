//! The walk: a node against a value, producing in place.

use crate::context::{Context, PathPart, State, Update, UpdateErr};
use crate::error::*;
use crate::node::{Kind, ListMode, Node, Validator};
use crate::stringify::stringify_node;
use crate::value::{is_integer, Map, Value};
use std::sync::Arc;

/// A cursor onto the value under validation: mutable when producing, shared
/// when only a verdict is wanted. Writes through a shared cursor are dropped,
/// so one walk serves both. A container's cursor is typed by its map or
/// vector once its kind is known.
pub(crate) enum Cur<'a, T = Value> {
    Mut(&'a mut T),
    Ref(&'a T),
}

impl<'a, T> Cur<'a, T> {
    fn get(&self) -> &T {
        match self {
            Cur::Mut(v) => v,
            Cur::Ref(v) => v,
        }
    }

    fn set(&mut self, nv: T) {
        if let Cur::Mut(v) = self {
            **v = nv;
        }
    }

    fn reborrow(&mut self) -> Cur<'_, T> {
        match self {
            Cur::Mut(v) => Cur::Mut(v),
            Cur::Ref(v) => Cur::Ref(v),
        }
    }
}

/// What a walk carries besides the value.
pub(crate) struct Walk<'c> {
    pub ctx: &'c mut Context,
    pub is_match: bool,
    /// The path from the root, the current key last.
    pub path: Vec<PathPart>,
    /// Whether the path is kept: a terse walk of a schema with no
    /// validators has nothing that reads it.
    pub paths: bool,
}

impl<'c> Walk<'c> {
    #[inline]
    fn push(&mut self, part: PathPart) {
        if self.paths {
            self.path.push(part);
        }
    }

    #[inline]
    fn pop(&mut self) {
        if self.paths {
            self.path.pop();
        }
    }
}

/// The digits of an index, written into a stack buffer: an element's key,
/// without an allocation per element.
fn index_key(i: usize, buf: &mut [u8; 20]) -> &str {
    let mut n = i;
    let mut pos = buf.len();
    loop {
        pos -= 1;
        buf[pos] = b'0' + (n % 10) as u8;
        n /= 10;
        if n == 0 {
            break;
        }
    }
    std::str::from_utf8(&buf[pos..]).unwrap()
}

pub(crate) fn required_mark_for(k: Kind) -> i64 {
    match k {
        Kind::Object => MARK_OBJECT_REQUIRED,
        Kind::Array => MARK_ARRAY_REQUIRED,
        _ => MARK_SCALAR_REQUIRED,
    }
}

pub(crate) fn type_mark_for(k: Kind) -> i64 {
    match k {
        Kind::Object => MARK_OBJECT_TYPE,
        Kind::Array => MARK_ARRAY_TYPE,
        Kind::Check => MARK_CHECK_TYPE,
        _ => MARK_SCALAR_TYPE,
    }
}

/// Validate a node against the value at `cur`, writing the produced value
/// through it. Returns false when the slot should be left out of the
/// produced container: nothing was there and nothing was injected.
pub(crate) fn validate_node(
    n: &Node,
    cur: Cur<'_>,
    key: &str,
    parent_is_array: bool,
    w: &mut Walk<'_>,
    verr: &mut ValidationError,
) -> bool {
    validate_node_with(
        n,
        &n.befores,
        &n.afters,
        n.silent,
        cur,
        key,
        parent_is_array,
        w,
        verr,
    )
}

/// `validate_node` with the checks and the silence given apart from the
/// node: an Ignore lifts the silence of the node it probes, and a Catch or
/// Transform runs the node with the checks it took inside.
#[allow(clippy::too_many_arguments)]
pub(crate) fn validate_node_with(
    n: &Node,
    befores: &[Validator],
    afters: &[Validator],
    silent: bool,
    mut cur: Cur<'_>,
    key: &str,
    parent_is_array: bool,
    w: &mut Walk<'_>,
    verr: &mut ValidationError,
) -> bool {
    let absent = cur.get().is_undefined();
    // A before may replace the value or the node; a replacement value under a
    // shared cursor lives here.
    let mut over: Option<Value> = None;
    let mut node_over: Option<Arc<Node>> = None;
    let mut done = false;

    for b in befores {
        let cur_node: &Node = node_over.as_deref().unwrap_or(n);
        let mut update = Update::default();
        let ok = {
            let value: &Value = over.as_ref().unwrap_or_else(|| cur.get());
            let mut state = State {
                path_arr: &w.path,
                key,
                value,
                node: cur_node,
                parent_is_array,
                is_match: w.is_match,
                ctx: w.ctx,
                absent,
                check_name: &b.name,
            };
            (b.func)(&mut state, &mut update)
        };
        if let Some(v) = update.val.take() {
            match &mut cur {
                Cur::Mut(_) => cur.set(v),
                Cur::Ref(_) => over = Some(v),
            }
        }
        if let Some(nn) = update.node.take() {
            node_over = Some(nn);
        }
        let cur_node: &Node = node_over.as_deref().unwrap_or(n);
        let cur_silent = if node_over.is_some() {
            cur_node.silent
        } else {
            silent
        };
        let value_now: &Value = over.as_ref().unwrap_or_else(|| cur.get());
        if !ok && absent_skips(cur_node, value_now, absent, &update) {
            continue;
        }
        if !ok {
            let at = at_of(w, key, cur_node, value_now, parent_is_array, &b.name);
            emit_update_errors(&at, cur_node, cur_silent, &update, verr);
        }
        if !ok || update.done {
            done = true;
        }
    }

    let n: &Node = node_over.as_deref().unwrap_or(n);
    let silent = if node_over.is_some() {
        n.silent
    } else {
        silent
    };
    let mut kept = true;
    if !done {
        let inner = match over.as_mut() {
            Some(v) => Cur::Mut(v),
            None => cur.reborrow(),
        };
        kept = validate_structure(n, silent, inner, key, parent_is_array, absent, w, verr);
    }

    // Afters run whatever the structural check reported.
    for a in afters {
        let mut update = Update::default();
        let ok = {
            let value: &Value = over.as_ref().unwrap_or_else(|| cur.get());
            let mut state = State {
                path_arr: &w.path,
                key,
                value,
                node: n,
                parent_is_array,
                is_match: w.is_match,
                ctx: w.ctx,
                absent,
                check_name: &a.name,
            };
            (a.func)(&mut state, &mut update)
        };
        if let Some(v) = update.val.take() {
            kept = true;
            match &mut cur {
                Cur::Mut(_) => cur.set(v),
                Cur::Ref(_) => over = Some(v),
            }
        }
        let value_now: &Value = over.as_ref().unwrap_or_else(|| cur.get());
        if !ok && absent_skips(n, value_now, absent, &update) {
            continue;
        }
        if !ok {
            let at = at_of(w, key, n, value_now, parent_is_array, &a.name);
            emit_update_errors(&at, n, silent, &update, verr);
        }
    }

    kept
}

/// A failed check against an absent value on a node that does not require
/// one raises nothing, unless the check insisted with `done`.
fn absent_skips(n: &Node, value: &Value, absent: bool, update: &Update) -> bool {
    absent && value.is_undefined() && (n.skippable || !n.required) && !update.done
}

/// The location of an error. A value renders as "undefined" when it is
/// undefined at the time of the error, as the canonical `s.val` does: an
/// injected default is the value a later check reports.
pub(crate) fn at_of<'a>(
    w: &'a Walk<'_>,
    key: &'a str,
    n: &Node,
    value: &'a Value,
    parent_is_array: bool,
    check: &'a str,
) -> At<'a> {
    At {
        path: &w.path,
        key,
        kind: n.kind,
        value,
        parent_arr: parent_is_array,
        absent: value.is_undefined(),
        check,
        regexp_src: n.regexp.as_ref().map(|r| format!("/{}/", r.as_str())),
        terse: w.ctx.terse,
    }
}

fn emit_update_errors(
    at: &At<'_>,
    n: &Node,
    silent: bool,
    update: &Update,
    verr: &mut ValidationError,
) {
    if silent {
        return;
    }
    let why = update.why.as_deref().unwrap_or("");
    match &update.err {
        None => {
            let why = if why.is_empty() { WHY_CHECK } else { why };
            let mark = if update.mark == 0 {
                MARK_CUSTOM_CHECK_ERR
            } else {
                update.mark
            };
            let mut err = make_err(at, why, mark, "");
            if let Some(f) = &n.fault_msg {
                if !err.terse {
                    err.text = expand_err_text(f, &err.path, at.value, at.absent);
                }
            }
            verr.add(err);
        }
        Some(UpdateErr::Text(t)) => {
            let why = if why.is_empty() { WHY_CHECK } else { why };
            let mark = if update.mark == 0 {
                MARK_CUSTOM_CHECK_TEXT
            } else {
                update.mark
            };
            verr.add(make_err(at, why, mark, t));
        }
        Some(UpdateErr::Field(e)) => {
            let mut e = (**e).clone();
            fill_field(&mut e, at);
            verr.add(e);
        }
        Some(UpdateErr::Fields(es)) => {
            for e in es {
                let mut e = e.clone();
                fill_field(&mut e, at);
                verr.add(e);
            }
        }
    }
}

fn fill_field(e: &mut FieldError, at: &At<'_>) {
    if e.path.is_empty() {
        e.path = crate::context::join_path(at.path);
    }
    if e.mark == 0 {
        e.mark = MARK_CUSTOM_CHECK_TEXT;
    }
}

fn add_structural(
    at: &At<'_>,
    n: &Node,
    silent: bool,
    why: &str,
    mark: i64,
    verr: &mut ValidationError,
) {
    let mut err = make_err(at, why, mark, "");
    if let Some(f) = &n.fault_msg {
        if !err.terse {
            err.text = expand_err_text(f, &err.path, at.value, at.absent);
        }
    }
    if !silent {
        verr.add(err);
    }
}

pub(crate) fn emit_type_err(
    w: &Walk<'_>,
    key: &str,
    n: &Node,
    silent: bool,
    value: &Value,
    parent_is_array: bool,
    verr: &mut ValidationError,
) {
    let at = at_of(w, key, n, value, parent_is_array, "");
    add_structural(&at, n, silent, WHY_TYPE, type_mark_for(n.kind), verr);
}

/// The structural checks: composition, nullable, never, the missing-value
/// rules and the kind check.
#[allow(clippy::too_many_arguments)]
fn validate_structure(
    n: &Node,
    silent: bool,
    mut cur: Cur<'_>,
    key: &str,
    parent_is_array: bool,
    absent: bool,
    w: &mut Walk<'_>,
    verr: &mut ValidationError,
) -> bool {
    if n.kind == Kind::List && n.list_mode != ListMode::None && (n.required || !absent) {
        return evaluate_list(n, silent, cur, key, parent_is_array, absent, w, verr);
    }

    // Nullable: an explicit null is the value.
    if cur.get().is_null() && n.nullable {
        return true;
    }

    // Never rejects a value present or absent.
    if n.kind == Kind::Never {
        let at = at_of(w, key, n, cur.get(), parent_is_array, "");
        add_structural(&at, n, silent, WHY_NEVER, MARK_NEVER, verr);
        return !absent;
    }

    // A regexp never reports "required": an absent value is a non-string.
    if n.kind == Kind::Regexp && absent && !n.required {
        return false;
    }

    // Missing: required error, skip, inject the default, or descend into an
    // empty container so that required descendants still raise.
    if absent && n.kind != Kind::Regexp {
        if n.required {
            let at = at_of(w, key, n, cur.get(), parent_is_array, "");
            add_structural(
                &at,
                n,
                silent,
                WHY_REQUIRED,
                required_mark_for(n.kind),
                verr,
            );
            return false;
        }
        if n.skippable {
            return false;
        }
        if !n.has_default && (n.kind == Kind::Object || n.kind == Kind::Array) {
            cur.set(if n.kind == Kind::Array {
                Value::Arr(Vec::new())
            } else {
                Value::Obj(Default::default())
            });
            if matches!(cur, Cur::Ref(_)) {
                // Nothing to write into: probe a scratch container so that
                // the descendants are still judged.
                let mut scratch = if n.kind == Kind::Array {
                    Value::Arr(Vec::new())
                } else {
                    Value::Obj(Default::default())
                };
                return validate_structure(
                    n,
                    silent,
                    Cur::Mut(&mut scratch),
                    key,
                    parent_is_array,
                    false,
                    w,
                    verr,
                );
            }
        } else {
            if n.default.is_undefined() {
                // Nothing to inject: the slot stays empty.
                return false;
            }
            cur.set(n.default.clone());
            return true;
        }
    }

    let value = cur.get();
    match n.kind {
        Kind::Any | Kind::Check => {}
        Kind::Regexp => {
            let Some(s) = value.as_str() else {
                let at = at_of(w, key, n, value, parent_is_array, "");
                let mut err = make_err(&at, WHY_TYPE, MARK_SCALAR_TYPE, "");
                err.kind = Kind::String;
                if !err.terse {
                    err.text = default_err_text(&err);
                    if let Some(f) = &n.fault_msg {
                        err.text = expand_err_text(f, &err.path, value, absent);
                    }
                }
                if !silent {
                    verr.add(err);
                }
                return true;
            };
            let matched = n.regexp.as_ref().is_some_and(|re| re.is_match(s));
            if !matched {
                let at = at_of(w, key, n, value, parent_is_array, "");
                add_structural(&at, n, silent, WHY_REGEXP, MARK_REGEXP, verr);
            }
        }
        Kind::String => match value {
            Value::Str(s) => {
                if s.is_empty() && !n.empty {
                    let at = at_of(w, key, n, value, parent_is_array, "");
                    add_structural(&at, n, silent, WHY_REQUIRED, MARK_UNDEF_REQUIRED, verr);
                }
            }
            _ => emit_type_err(w, key, n, silent, value, parent_is_array, verr),
        },
        Kind::Number => match value {
            Value::Num(x) if !x.is_nan() => {}
            _ => emit_type_err(w, key, n, silent, value, parent_is_array, verr),
        },
        Kind::Integer => match value {
            Value::Num(x) if is_integer(*x) => {}
            _ => emit_type_err(w, key, n, silent, value, parent_is_array, verr),
        },
        Kind::Boolean => {
            if !matches!(value, Value::Bool(_)) {
                emit_type_err(w, key, n, silent, value, parent_is_array, verr);
            }
        }
        Kind::Date => {
            if !matches!(value, Value::Date(_)) {
                emit_type_err(w, key, n, silent, value, parent_is_array, verr);
            }
        }
        Kind::BigInt => {
            if !matches!(value, Value::BigInt(_)) {
                emit_type_err(w, key, n, silent, value, parent_is_array, verr);
            }
        }
        Kind::NaN => match value {
            Value::Num(x) if x.is_nan() => {}
            _ => emit_type_err(w, key, n, silent, value, parent_is_array, verr),
        },
        Kind::Null => {
            if !value.is_null() {
                emit_type_err(w, key, n, silent, value, parent_is_array, verr);
            }
        }
        Kind::Function => {
            if !matches!(value, Value::Func(_)) {
                emit_type_err(w, key, n, silent, value, parent_is_array, verr);
            }
        }
        Kind::Array => return validate_array(n, silent, cur, key, parent_is_array, w, verr),
        Kind::Object => return validate_object(n, silent, cur, key, parent_is_array, w, verr),
        Kind::Never | Kind::List => {}
    }
    true
}

/// The key of the child at `idx`, shared with the node once it is prepared;
/// a node that never was allocates it.
fn child_key(n: &Node, idx: usize, k: &str) -> Arc<str> {
    match n.obj_keys.get(idx) {
        Some(key) => Arc::clone(key),
        None => Arc::from(k),
    }
}

/// Whether the input's keys are the declared keys in declaration order, or
/// a prefix of them: then none is unknown, and each child sits at its own
/// index. The usual case for JSON written from the same shape, and a
/// string comparison per key rather than a hash lookup.
fn aligned(n: &Node, map: &Map) -> bool {
    map.len() <= n.obj_keys.len()
        && map
            .keys()
            .zip(&n.obj_keys)
            .all(|(k, dk)| k.as_str() == &**dk)
}

/// The keys of a closed object it does not consume, in the input's order.
fn unknown_keys(n: &Node, map: &Map) -> Vec<String> {
    map.iter()
        .filter(|(k, v)| !v.is_undefined() && !n.consumed.contains(*k))
        .map(|(k, _)| k.clone())
        .collect()
}

fn validate_object(
    n: &Node,
    silent: bool,
    cur: Cur<'_>,
    key: &str,
    parent_is_array: bool,
    w: &mut Walk<'_>,
    verr: &mut ValidationError,
) -> bool {
    // Unknown keys are reported before descending, in one message, in the
    // input's order.
    let aligned = cur.get().as_obj().is_some_and(|map| aligned(n, map));
    if let Some(map) = cur.get().as_obj() {
        if !n.is_open() && !aligned {
            let unknown = unknown_keys(n, map);
            if !unknown.is_empty() {
                let value = cur.get();
                let joined = unknown.join(", ");
                let at = at_of(w, &joined, n, value, parent_is_array, "");
                let mut err = make_err(&at, WHY_CLOSED, MARK_OBJECT_CLOSED, "");
                err.plural = unknown.len() > 1;
                if !err.terse {
                    err.text = default_err_text(&err);
                    if let Some(f) = &n.fault_msg {
                        err.text = expand_err_text(f, &err.path, value, false);
                    }
                }
                if !silent {
                    verr.add(err);
                }
            }
        }
    }

    // The container is the wrong type: its declared keys are meaningless,
    // so no descent.
    let mut oc: Cur<'_, Map> = match cur {
        Cur::Mut(Value::Obj(m)) => Cur::Mut(m),
        Cur::Ref(Value::Obj(m)) => Cur::Ref(m),
        other => {
            emit_type_err(w, key, n, silent, other.get(), parent_is_array, verr);
            return true;
        }
    };

    for (idx, (k, cn)) in n.obj_children.iter().enumerate() {
        // A rename's claim: the value is missing and a claimed source has
        // it, so it is picked up from there.
        let mut claimed: Option<&Value> = None;
        if cn.rename_to.is_some() && !cn.rename_claim.is_empty() {
            let present = oc.get().get(k).map(|v| !v.is_undefined()).unwrap_or(false);
            if !present {
                let src = cn
                    .rename_claim
                    .iter()
                    .find(|src| oc.get().contains_key(*src))
                    .cloned();
                if let Some(src) = src {
                    match &mut oc {
                        Cur::Mut(map) => {
                            let v = if cn.rename_keep {
                                map.get(&src).cloned().unwrap()
                            } else {
                                map.shift_remove(&src).unwrap()
                            };
                            map.insert(k.clone(), v);
                        }
                        Cur::Ref(map) => claimed = map.get(&src),
                    }
                }
            }
        }

        // The shared key is only taken when the path is kept.
        if w.paths {
            w.push(PathPart::Key(child_key(n, idx, k)));
        }
        let mut scratch = Value::Undefined;
        let (child, was_absent) = match &mut oc {
            Cur::Mut(map) => {
                let was_absent = !map.contains_key(k);
                let slot = map.entry(k.clone()).or_insert(Value::Undefined);
                (Cur::Mut(slot), was_absent)
            }
            Cur::Ref(map) => {
                // A read-only walk of an aligned input finds the child by
                // index; the map cannot have changed under it.
                let found = if aligned {
                    map.get_index(idx).map(|(_, v)| v)
                } else {
                    claimed.or_else(|| map.get(k))
                };
                match found {
                    Some(child) if !child.is_undefined() => (Cur::Ref(child), false),
                    _ => (Cur::Mut(&mut scratch), true),
                }
            }
        };
        let keep = if cn.is_ignore() {
            validate_ignored(cn, child, k, false, w, verr)
        } else {
            validate_node(cn, child, k, false, w, verr)
        };
        w.pop();
        if let Cur::Mut(m) = &mut oc {
            if !keep {
                let empty = m.get(k).map(|x| x.is_undefined()).unwrap_or(false);
                if was_absent || empty || cn.is_ignore() {
                    m.shift_remove(k);
                }
            } else if let Some(to) = &cn.rename_to {
                // The produced value moves under the new name.
                if to != k {
                    let v = if cn.rename_keep {
                        m.get(k).cloned()
                    } else {
                        m.shift_remove(k)
                    };
                    if let Some(v) = v {
                        m.insert(to.clone(), v);
                    }
                }
            }
        }
    }

    // An aligned read-only walk has nothing left over.
    let rest_keys = !(aligned && matches!(oc, Cur::Ref(_)));
    if let Some(rest) = n.obj_rest.as_deref().filter(|_| rest_keys) {
        let extra: Vec<String> = oc
            .get()
            .iter()
            .filter(|(k, v)| !v.is_undefined() && !n.obj_children.contains_key(*k))
            .map(|(k, _)| k.clone())
            .collect();
        for k in extra {
            w.push(PathPart::Key(Arc::from(k.as_str())));
            let child = match &mut oc {
                Cur::Mut(map) => Cur::Mut(map.get_mut(&k).unwrap()),
                Cur::Ref(map) => Cur::Ref(map.get(&k).unwrap()),
            };
            let keep = if rest.is_ignore() {
                validate_ignored(rest, child, &k, false, w, verr)
            } else {
                validate_node(rest, child, &k, false, w, verr)
            };
            w.pop();
            if !keep {
                if let Cur::Mut(m) = &mut oc {
                    m.shift_remove(&k);
                }
            }
        }
    }
    true
}

fn validate_array(
    n: &Node,
    silent: bool,
    cur: Cur<'_>,
    key: &str,
    parent_is_array: bool,
    w: &mut Walk<'_>,
    verr: &mut ValidationError,
) -> bool {
    let fixed = n.arr_children.len();
    let has_child = n.arr_child.is_some();

    // A closed tuple with extra elements: one error naming the first index
    // beyond the tuple, and no element is validated.
    if let Some(arr) = cur.get().as_arr() {
        if fixed > 0 && arr.len() > fixed && !has_child && n.arr_rest.is_none() {
            let value = cur.get();
            let k = fixed.to_string();
            let at = at_of(w, &k, n, value, parent_is_array, "");
            let mut err = make_err(&at, WHY_CLOSED, MARK_ARRAY_CLOSED, "");
            if !err.terse {
                if let Some(f) = &n.fault_msg {
                    err.text = expand_err_text(f, &err.path, value, false);
                }
            }
            if !silent {
                verr.add(err);
            }
            return true;
        }
    }

    let mut ac: Cur<'_, Vec<Value>> = match cur {
        Cur::Mut(Value::Arr(a)) => Cur::Mut(a),
        Cur::Ref(Value::Arr(a)) => Cur::Ref(a),
        other => {
            emit_type_err(w, key, n, silent, other.get(), parent_is_array, verr);
            return true;
        }
    };
    let len = ac.get().len();

    let mut buf = [0u8; 20];
    let mut i = 0usize;
    for cn in &n.arr_children {
        let k = index_key(i, &mut buf);
        w.push(PathPart::Index(i));
        let mut scratch = Value::Undefined;
        let (child, appended) = match &mut ac {
            Cur::Mut(a) => {
                let appended = i >= a.len();
                if appended {
                    a.push(Value::Undefined);
                }
                (Cur::Mut(&mut a[i]), appended)
            }
            Cur::Ref(a) => match a.get(i) {
                Some(e) if !e.is_undefined() => (Cur::Ref(e), false),
                _ => (Cur::Mut(&mut scratch), true),
            },
        };
        let keep = if cn.is_ignore() {
            validate_ignored(cn, child, k, true, w, verr)
        } else {
            validate_node(cn, child, k, true, w, verr)
        };
        w.pop();
        if !keep && !appended && cn.is_ignore() {
            if let Cur::Mut(a) = &mut ac {
                a[i] = Value::Undefined;
            }
        }
        i += 1;
    }
    // Positions appended for missing tuple slots that produced nothing are
    // holes at the end; drop them.
    if let Cur::Mut(a) = &mut ac {
        while a.len() > len && a.last().map(|x| x.is_undefined()).unwrap_or(false) {
            a.pop();
        }
    }

    if let Some(child_shape) = n.arr_child.as_deref().or(n.arr_rest.as_deref()) {
        let mut drop_at: Vec<usize> = Vec::new();
        while i < len {
            let k = index_key(i, &mut buf);
            w.push(PathPart::Index(i));
            let child = match &mut ac {
                Cur::Mut(a) => Cur::Mut(&mut a[i]),
                Cur::Ref(a) => Cur::Ref(&a[i]),
            };
            let keep = if child_shape.is_ignore() {
                validate_ignored(child_shape, child, k, true, w, verr)
            } else {
                validate_node(child_shape, child, k, true, w, verr)
            };
            w.pop();
            if !keep && child_shape.is_ignore() {
                drop_at.push(i);
            }
            i += 1;
        }
        if let Cur::Mut(a) = &mut ac {
            for idx in drop_at {
                a[idx] = Value::Undefined;
            }
        }
    }
    true
}

/// An `Ignore` node: run it with its silence lifted into a collector of its
/// own, and drop the value when anything failed.
pub(crate) fn validate_ignored(
    n: &Node,
    cur: Cur<'_>,
    key: &str,
    parent_is_array: bool,
    w: &mut Walk<'_>,
    _verr: &mut ValidationError,
) -> bool {
    let mut sub = ValidationError::default();
    let kept = validate_node_with(
        n,
        &n.befores,
        &n.afters,
        false,
        cur,
        key,
        parent_is_array,
        w,
        &mut sub,
    );
    !sub.has_any() && kept
}

/// Whether a branch accepts the value, without producing or rendering.
fn branch_passes(
    sn: &Node,
    value: &Value,
    key: &str,
    parent_is_array: bool,
    w: &mut Walk<'_>,
) -> bool {
    let saved = (w.is_match, w.ctx.terse);
    w.is_match = true;
    w.ctx.terse = true;
    let mut sub = ValidationError {
        terse: true,
        ..Default::default()
    };
    validate_node(sn, Cur::Ref(value), key, parent_is_array, w, &mut sub);
    w.is_match = saved.0;
    w.ctx.terse = saved.1;
    !sub.has_any()
}

#[allow(clippy::too_many_arguments)]
fn list_error(
    n: &Node,
    silent: bool,
    value: &Value,
    key: &str,
    parent_is_array: bool,
    w: &Walk<'_>,
    verr: &mut ValidationError,
    why: &str,
    mark: i64,
    words: &str,
    fault_applies: bool,
) {
    let names: Vec<String> = n.list.iter().map(|sn| stringify_node(sn, true)).collect();
    let at = at_of(w, key, n, value, parent_is_array, "");
    let text = format!(
        "Value \"$VALUE\" for property \"$PATH\" does not satisfy {}: {}",
        words,
        names.join(", ")
    );
    let mut err = make_err(&at, why, mark, &text);
    if fault_applies && !err.terse {
        if let Some(f) = &n.fault_msg {
            err.text = expand_err_text(f, &err.path, value, at.absent);
        }
    }
    if !silent {
        verr.add(err);
    }
}

/// One, Some and All. The branches see the value as the parent saw it: an
/// absent value stays absent, so a branch that does not require one can
/// still match and supply its default.
#[allow(clippy::too_many_arguments)]
fn evaluate_list(
    n: &Node,
    silent: bool,
    mut cur: Cur<'_>,
    key: &str,
    parent_is_array: bool,
    _absent: bool,
    w: &mut Walk<'_>,
    verr: &mut ValidationError,
) -> bool {
    match n.list_mode {
        ListMode::One => {
            let winner = n
                .list
                .iter()
                .position(|sn| branch_passes(sn, cur.get(), key, parent_is_array, w));
            match winner {
                Some(i) => {
                    // The value is produced by the branch that took it.
                    let mut sub = ValidationError::default();
                    validate_node(
                        &n.list[i],
                        cur.reborrow(),
                        key,
                        parent_is_array,
                        w,
                        &mut sub,
                    )
                }
                None => {
                    list_error(
                        n,
                        silent,
                        cur.get(),
                        key,
                        parent_is_array,
                        w,
                        verr,
                        "One",
                        4030,
                        "one of",
                        true,
                    );
                    true
                }
            }
        }
        ListMode::Some => {
            // Every matching branch produces from the original value; the
            // last one's result stands.
            let original = cur.get().clone();
            let mut matched = false;
            let mut kept = true;
            for sn in &n.list {
                if !branch_passes(sn, &original, key, parent_is_array, w) {
                    continue;
                }
                matched = true;
                cur.set(original.clone());
                let mut sub = ValidationError::default();
                kept = validate_node(sn, cur.reborrow(), key, parent_is_array, w, &mut sub);
            }
            if !matched {
                list_error(
                    n,
                    silent,
                    &original,
                    key,
                    parent_is_array,
                    w,
                    verr,
                    "Some",
                    4031,
                    "any of",
                    true,
                );
                return true;
            }
            kept
        }
        _ => {
            // All threads the value through its branches; a branch that
            // fails leaves the value as the one before it produced.
            let original = cur.get().clone();
            let mut pass_all = true;
            let mut kept = true;
            for sn in &n.list {
                let before = cur.get().clone();
                let mut sub = ValidationError::default();
                let k = validate_node(sn, cur.reborrow(), key, parent_is_array, w, &mut sub);
                if sub.has_any() {
                    pass_all = false;
                    cur.set(before);
                } else {
                    kept = k;
                }
            }
            if !pass_all {
                cur.set(original.clone());
                list_error(
                    n,
                    silent,
                    &original,
                    key,
                    parent_is_array,
                    w,
                    verr,
                    "All",
                    4032,
                    "all of",
                    false,
                );
                return true;
            }
            kept
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::builders::*;
    use crate::node::{Token, Validator};
    use crate::spec::{arr, obj, Spec};
    use crate::Schema;
    use regex::Regex;
    use std::sync::Arc;

    fn chk(
        name: &str,
        f: impl Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
    ) -> Validator {
        Validator {
            name: name.into(),
            func: Arc::new(f),
            args: vec![],
            suffix: None,
            inner: None,
        }
    }

    fn j(s: &str) -> Value {
        Value::from(serde_json::from_str::<serde_json::Value>(s).unwrap())
    }

    fn run(s: &Schema, input: &str) -> String {
        match s.validate(j(input)) {
            Ok(v) => serde_json::Value::from(v).to_string(),
            Err(e) => format!("ERR {}", e),
        }
    }

    fn before(mut n: Node, v: Validator) -> Node {
        n.befores.push(v);
        n
    }

    fn after(mut n: Node, v: Validator) -> Node {
        n.afters.push(v);
        n
    }

    fn at_a(n: impl Into<Spec>) -> Schema {
        Schema::new(obj([("a", n.into())]))
    }

    fn fail() -> Validator {
        chk("Odd", |_, _| false)
    }

    #[test]
    fn index_keys_need_no_allocation() {
        let mut buf = [0u8; 20];
        assert_eq!(index_key(0, &mut buf), "0");
        assert_eq!(index_key(7, &mut buf), "7");
        assert_eq!(index_key(1234567890123, &mut buf), "1234567890123");
    }

    #[test]
    fn unprepared_object_keys_are_allocated() {
        // A node that never went through prepare has no shared keys, so the
        // walk allocates them; the path still renders.
        let n = crate::normalize::normalize(obj([("a", Token::Number)]));
        assert!(n.obj_keys.is_empty());
        let mut ctx = crate::Context::new();
        let mut w = Walk {
            ctx: &mut ctx,
            is_match: false,
            path: Vec::new(),
            paths: true,
        };
        let mut verr = ValidationError::default();
        let mut val = j(r#"{"a":"x"}"#);
        validate_node(&n, Cur::Mut(&mut val), "", false, &mut w, &mut verr);
        // Nothing is consumed either, so the key is also reported unknown.
        assert_eq!(
            verr.to_string(),
            "Validation failed for object \"{a:x}\" because the property \"a\" is not allowed.\n\
             Validation failed for property \"a\" with string \"x\" because the string is not of type number."
        );
    }

    #[test]
    fn marks() {
        assert_eq!(required_mark_for(Kind::Object), MARK_OBJECT_REQUIRED);
        assert_eq!(required_mark_for(Kind::Array), MARK_ARRAY_REQUIRED);
        assert_eq!(required_mark_for(Kind::String), MARK_SCALAR_REQUIRED);
        assert_eq!(type_mark_for(Kind::Object), MARK_OBJECT_TYPE);
        assert_eq!(type_mark_for(Kind::Array), MARK_ARRAY_TYPE);
        assert_eq!(type_mark_for(Kind::Check), MARK_CHECK_TYPE);
        assert_eq!(type_mark_for(Kind::String), MARK_SCALAR_TYPE);
    }

    #[test]
    fn custom_check_errors() {
        let s = at_a(before(buildize(Token::Number), fail()));
        assert_eq!(
            run(&s, r#"{"a":1}"#),
            "ERR Validation failed for property \"a\" with number \"1\" because check \"Odd\" failed."
        );
        assert!(!s.valid(&j(r#"{"a":1}"#)));
        assert_eq!(s.error(&j(r#"{"a":1}"#))[0].mark, MARK_CUSTOM_CHECK_ERR);

        let s = at_a(before(fault("bad $PATH $VALUE", Token::Number), fail()));
        assert_eq!(run(&s, r#"{"a":1}"#), "ERR bad a 1");
        assert!(!s.valid(&j(r#"{"a":1}"#)));

        let mut quiet = buildize(Token::Number);
        quiet.silent = true;
        let s = at_a(before(quiet, fail()));
        assert_eq!(run(&s, r#"{"a":1}"#), r#"{"a":1}"#);

        let text = chk("T", |_, u| {
            u.err = Some(UpdateErr::Text("no $PATH=$VALUE".into()));
            false
        });
        let s = at_a(before(buildize(Token::Number), text));
        assert_eq!(run(&s, r#"{"a":1}"#), "ERR no a=1");
        let e = &s.error(&j(r#"{"a":1}"#))[0];
        assert_eq!(
            (e.mark, e.why.as_str()),
            (MARK_CUSTOM_CHECK_TEXT, WHY_CHECK)
        );

        let marked = chk("M", |_, u| {
            u.err = Some(UpdateErr::Text("m".into()));
            u.why = Some("odd".into());
            u.mark = 99;
            false
        });
        let e = &at_a(before(buildize(Token::Number), marked)).error(&j(r#"{"a":1}"#))[0];
        assert_eq!((e.mark, e.why.as_str(), e.text.as_str()), (99, "odd", "m"));
        let marked = chk("M", |_, u| {
            u.why = Some("odd".into());
            u.mark = 98;
            false
        });
        let e = &at_a(before(buildize(Token::Number), marked)).error(&j(r#"{"a":1}"#))[0];
        assert_eq!((e.mark, e.why.as_str()), (98, "odd"));

        let field = chk("F", |_, u| {
            u.err = Some(UpdateErr::Field(Box::new(FieldError {
                text: "f".into(),
                ..Default::default()
            })));
            false
        });
        let s = at_a(before(buildize(Token::Number), field));
        assert_eq!(run(&s, r#"{"a":1}"#), "ERR f");
        let e = &s.error(&j(r#"{"a":1}"#))[0];
        assert_eq!((e.path.as_str(), e.mark), ("a", MARK_CUSTOM_CHECK_TEXT));

        let fields = chk("F", |_, u| {
            u.err = Some(UpdateErr::Fields(vec![
                FieldError {
                    text: "f1".into(),
                    ..Default::default()
                },
                FieldError {
                    text: "f2".into(),
                    path: "z".into(),
                    mark: 7,
                    ..Default::default()
                },
            ]));
            false
        });
        let s = at_a(before(buildize(Token::Number), fields));
        assert_eq!(run(&s, r#"{"a":1}"#), "ERR f1\nf2");
        let es = s.error(&j(r#"{"a":1}"#));
        assert_eq!((es[1].path.as_str(), es[1].mark), ("z", 7));
    }

    #[test]
    fn befores_replace_value_or_node_and_may_stop() {
        let dbl = chk("Dbl", |s, u| {
            if let Value::Num(x) = s.value {
                u.val = Some(Value::Num(x * 2.0));
            }
            true
        });
        let s = at_a(before(buildize(Token::Number), dbl));
        assert_eq!(run(&s, r#"{"a":2}"#), r#"{"a":4}"#);
        assert!(s.valid(&j(r#"{"a":2}"#)));

        let to_str = chk("Str", |_, u| {
            u.val = Some(Value::Str("x".into()));
            true
        });
        let s = at_a(before(buildize(Token::Number), to_str));
        assert_eq!(
            run(&s, r#"{"a":2}"#),
            "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."
        );
        assert!(!s.valid(&j(r#"{"a":2}"#)));

        let swap = chk("Swap", |_, u| {
            u.node = Some(Arc::new(buildize(Token::String)));
            true
        });
        let s = at_a(before(buildize(Token::Number), swap));
        assert_eq!(run(&s, r#"{"a":"x"}"#), r#"{"a":"x"}"#);

        let stop = chk("Stop", |_, u| {
            u.done = true;
            true
        });
        let s = at_a(before(buildize(Token::Number), stop));
        assert_eq!(run(&s, r#"{"a":"x"}"#), r#"{"a":"x"}"#);

        // A failing check against an absent optional value is not an error.
        let s = at_a(before(optional(Token::Number), fail()));
        assert_eq!(run(&s, "{}"), r#"{"a":0}"#);
        // Unless the check insisted.
        let insist = chk("I", |_, u| {
            u.done = true;
            false
        });
        let s = at_a(before(optional(Token::Number), insist));
        assert_eq!(s.error(&j("{}")).len(), 1);
        // A required node's absence is the check's to report too, once.
        let s = at_a(before(required(Token::Number), fail()));
        assert_eq!(s.error(&j("{}")).len(), 1);
        // The check sees the state it is given.
        let peek = chk("Peek", |s, _| {
            s.absent && s.key == "a" && s.path_str() == "a" && !s.is_match && !s.parent_is_array
        });
        let s = at_a(before(optional(Token::Number), peek));
        assert_eq!(run(&s, "{}"), r#"{"a":0}"#);
    }

    #[test]
    fn afters_run_after_structure() {
        let s = at_a(after(buildize(Token::Number), fail()));
        assert_eq!(s.error(&j(r#"{"a":1}"#))[0].check, "Odd");

        let inc = chk("Inc", |s, u| {
            if let Value::Num(x) = s.value {
                u.val = Some(Value::Num(x + 1.0));
            }
            true
        });
        let s = at_a(after(buildize(Token::Number), inc));
        assert_eq!(run(&s, r#"{"a":1}"#), r#"{"a":2}"#);
        assert!(s.valid(&j(r#"{"a":1}"#)));

        let fill = chk("Fill", |_, u| {
            u.val = Some(Value::Num(9.0));
            true
        });
        let s = at_a(after(skip(Token::Number), fill));
        assert_eq!(run(&s, "{}"), r#"{"a":9}"#);

        // An injected default is the value a failing after reports.
        let s = at_a(after(optional(Token::Number), fail()));
        assert_eq!(
            run(&s, "{}"),
            "ERR Validation failed for property \"a\" with number \"0\" because check \"Odd\" failed."
        );
        let s = at_a(after(skip(Token::Number), fail()));
        assert_eq!(run(&s, "{}"), "{}");
    }

    #[test]
    fn structural_rules() {
        assert_eq!(
            run(&Schema::new(one([Spec::from(Token::Number)])), "1"),
            "1"
        );
        assert_eq!(
            run(&Schema::new(Spec::from(Node::of(Kind::List))), "1"),
            "1"
        );

        assert_eq!(
            run(&at_a(nullable(Token::String)), r#"{"a":null}"#),
            r#"{"a":null}"#
        );

        let s = at_a(never(1));
        assert_eq!(s.error(&j(r#"{"a":1}"#))[0].why, WHY_NEVER);
        assert_eq!(s.error(&j("{}"))[0].why, WHY_NEVER);
        assert!(!s.valid(&j("{}")));
        assert_eq!(run(&at_a(never(1).fault("nope")), r#"{"a":1}"#), "ERR nope");

        let re = || Regex::new("^a+$").unwrap();
        let s = at_a(buildize(re()));
        assert_eq!(
            run(&s, r#"{"a":"b"}"#),
            "ERR Validation failed for property \"a\" with string \"b\" because the string did not match /^a+$/."
        );
        assert_eq!(
            run(&s, r#"{"a":1}"#),
            "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type string."
        );
        // A regexp never reports "required": an absent value is a non-string.
        assert_eq!(
            run(&s, "{}"),
            "ERR Validation failed for property \"a\" with value \"undefined\" because the value is not of type string."
        );
        assert_eq!(run(&s, r#"{"a":"aa"}"#), r#"{"a":"aa"}"#);
        assert_eq!(run(&at_a(optional(re())), "{}"), "{}");
        assert_eq!(run(&at_a(fault("F", re())), r#"{"a":1}"#), "ERR F");
        assert!(!at_a(fault("F", re())).valid(&j(r#"{"a":1}"#)));
        let mut quiet = buildize(re());
        quiet.silent = true;
        assert_eq!(run(&at_a(quiet), r#"{"a":1}"#), r#"{"a":1}"#);

        // An absent container is probed on a shared cursor so that required
        // descendants still raise.
        let s = at_a(obj([("b", Spec::from(Token::String))]));
        assert!(!s.valid(&j("{}")));
        assert_eq!(s.error(&j("{}"))[0].path, "a.b");
        let s = at_a(arr([Spec::from(Token::String), Spec::from(1)]));
        assert!(!s.valid(&j("{}")));
        assert_eq!(run(&at_a(buildize(Token::Any)), "{}"), "{}");
        // An absent root, likewise.
        let s = Schema::new(obj([("b", Spec::from(Token::String))]));
        assert!(!s.valid(&Value::Undefined));
        assert_eq!(s.error(&Value::Undefined)[0].path, "b");
        let s = Schema::new(arr([Spec::from(Token::String), Spec::from(1)]));
        assert!(!s.valid(&Value::Undefined));
        assert_eq!(s.error(&Value::Undefined)[0].path, "0");
        assert!(Schema::new(obj([("b", Spec::from(1))])).valid(&Value::Undefined));
    }

    #[test]
    fn leaf_type_errors() {
        let cases: Vec<(Node, &str, &str)> = vec![
            (
                buildize(Token::Integer),
                r#"{"a":1.5}"#,
                "number \"1.5\" because the number is not of type integer.",
            ),
            (
                buildize(Token::Boolean),
                r#"{"a":1}"#,
                "number \"1\" because the number is not of type boolean.",
            ),
            (
                buildize(Spec::Value(Value::Date(0))),
                r#"{"a":1}"#,
                "number \"1\" because the number is not of type date.",
            ),
            (
                buildize(num_bigint::BigInt::from(1)),
                r#"{"a":1}"#,
                "number \"1\" because the number is not of type bigint.",
            ),
            (
                buildize(f64::NAN),
                r#"{"a":1}"#,
                "number \"1\" because the number is not of type nan.",
            ),
            (
                buildize(Spec::Value(Value::Null)),
                r#"{"a":1}"#,
                "number \"1\" because the number is not of type null.",
            ),
            (
                buildize(Spec::Value(Value::Func(1))),
                r#"{"a":1}"#,
                "number \"1\" because the number is not of type function.",
            ),
        ];
        for (n, input, tail) in cases {
            assert_eq!(
                run(&at_a(n), input),
                format!("ERR Validation failed for property \"a\" with {}", tail)
            );
        }
        let s = at_a(buildize(Spec::Value(Value::Date(0))));
        let dated = Value::Obj([("a".to_string(), Value::Date(5))].into_iter().collect());
        assert_eq!(s.validate(dated.clone()).unwrap(), dated);
    }

    #[test]
    fn objects() {
        let inner = || obj([("a", Spec::from(1))]);
        let s = Schema::new(obj([("o", Spec::from(fault("F $PATH", inner())))]));
        assert_eq!(run(&s, r#"{"o":{"z":1}}"#), "ERR F o");
        assert!(!s.valid(&j(r#"{"o":{"z":1}}"#)));
        let mut quiet = buildize(inner());
        quiet.silent = true;
        let s = Schema::new(obj([("o", Spec::from(quiet))]));
        assert_eq!(run(&s, r#"{"o":{"z":1}}"#), r#"{"o":{"z":1,"a":1}}"#);

        let s = Schema::new(obj([("o", inner())]));
        assert!(s.valid(&j(r#"{"o":{"a":2}}"#)));
        assert!(!s.valid(&j(r#"{"o":{"a":"x"}}"#)));
        assert!(s.valid(&j(r#"{"o":{}}"#)));
        assert!(!s.valid(&j(r#"{"o":1}"#)));

        let s = at_a(ignore(Token::Number));
        assert_eq!(run(&s, r#"{"a":"x"}"#), "{}");
        assert_eq!(run(&s, r#"{"a":5}"#), r#"{"a":5}"#);
        assert_eq!(run(&s, "{}"), "{}");
        assert!(s.valid(&j(r#"{"a":"x"}"#)));
        assert!(s.valid(&j(r#"{"a":5}"#)));

        let s = Schema::new(child(Token::Number, inner()));
        assert_eq!(run(&s, r#"{"a":1,"z":2}"#), r#"{"a":1,"z":2}"#);
        assert!(!s.valid(&j(r#"{"a":1,"z":"x"}"#)));
        let s = Schema::new(child(ignore(Token::Number), inner()));
        assert_eq!(run(&s, r#"{"a":1,"z":"x"}"#), r#"{"a":1}"#);
        assert!(s.valid(&j(r#"{"a":1,"z":"x"}"#)));
    }

    #[test]
    fn arrays() {
        let s = at_a(fault("F", arr([Spec::from(Token::Number)])));
        assert_eq!(run(&s, r#"{"a":1}"#), "ERR F");
        let tuple = || arr([Spec::from(1), Spec::from(2)]);
        assert_eq!(run(&at_a(fault("T", tuple())), r#"{"a":[1,2,3]}"#), "ERR T");
        assert!(!at_a(fault("T", tuple())).valid(&j(r#"{"a":[1,2,3]}"#)));
        let mut quiet = buildize(tuple());
        quiet.silent = true;
        assert_eq!(run(&at_a(quiet), r#"{"a":[1,2,3]}"#), r#"{"a":[1,2,3]}"#);

        let s = at_a(tuple());
        assert!(s.valid(&j(r#"{"a":[1,2]}"#)));
        assert!(!s.valid(&j(r#"{"a":["x"]}"#)));
        assert!(s.valid(&j(r#"{"a":[]}"#)));
        let s = at_a(arr([Spec::from(Token::String), Spec::from(2)]));
        assert!(!s.valid(&j(r#"{"a":[]}"#)));

        let s = at_a(arr([Spec::from(ignore(Token::Number)), Spec::from(2)]));
        assert_eq!(run(&s, r#"{"a":["x",2]}"#), r#"{"a":[null,2]}"#);
        assert_eq!(run(&s, r#"{"a":[1]}"#), r#"{"a":[1,2]}"#);
        assert!(s.valid(&j(r#"{"a":["x",2]}"#)));

        let s = at_a(arr([Spec::from(1), Spec::from(skip(Token::Number))]));
        assert_eq!(run(&s, r#"{"a":[]}"#), r#"{"a":[1]}"#);

        let s = at_a(arr([Spec::from(Token::Number)]));
        assert!(!s.valid(&j(r#"{"a":[1,"x"]}"#)));
        assert!(s.valid(&j(r#"{"a":[1,2]}"#)));
        let s = at_a(arr([Spec::from(ignore(Token::Number))]));
        assert_eq!(run(&s, r#"{"a":[1,"x"]}"#), r#"{"a":[1,null]}"#);
        assert!(s.valid(&j(r#"{"a":[1,"x"]}"#)));
    }

    #[test]
    fn root_ignore_drops_a_bad_value() {
        let s = Schema::new(ignore(Token::Number));
        assert_eq!(run(&s, "\"x\""), "null");
        assert_eq!(run(&s, "5"), "5");
        assert!(s.valid(&j("\"x\"")));
        assert!(s.error(&j("\"x\"")).is_empty());
        assert_eq!(s.node().kind, Kind::Number);
    }
}
