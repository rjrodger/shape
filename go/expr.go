package shape

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"
)

// Expr parses a string DSL into a *Node spec, mirroring TS Shape.expr.
//
// Supported tokens:
//   - Builder names: Required, Optional, Min, Max, Above, Below, Len, Check,
//     Open, Closed, Skip, Ignore, Empty, Default, Fault, Never, Type, Exact,
//     One, Some, All, Child, Rest, Define, Refer, Rename, Func, Key.
//   - Type tokens: String, Number, Boolean, Object, Array, Function, Any.
//   - Literals: JSON values (numbers, strings, true, false, null) and undefined/NaN.
//   - Regexp: /pattern/.
//   - Method chaining via dot: "String.Min(2).Max(10)".
//   - Comma-separated args inside parentheses: "Min(2, String)".
func Expr(src string) (*Node, error) {
	tokens, err := tokenize(src)
	if err != nil {
		return nil, err
	}
	p := &exprParser{tokens: tokens, src: src}
	node, err := p.parseFull()
	if err != nil {
		return nil, err
	}
	return node, nil
}

// MustExpr is Expr that panics on error.
func MustExpr(src string) *Node {
	n, err := Expr(src)
	if err != nil {
		panic(err)
	}
	return n
}

// Build is the convenience wrapper used by TS to expand JSON-shaped specs.
// Strings are parsed via Expr; everything else is normalized as-is.
func Build(spec any) (*Schema, error) {
	v, err := buildValue(spec)
	if err != nil {
		return nil, err
	}
	return Shape(v)
}

func buildValue(spec any) (any, error) {
	switch v := spec.(type) {
	case string:
		return Expr(v)
	case map[string]any:
		out := map[string]any{}
		for k, sv := range v {
			if k == "$$" {
				out[k] = sv
				continue
			}
			converted, err := buildValue(sv)
			if err != nil {
				return nil, err
			}
			out[k] = converted
		}
		return out, nil
	case []any:
		out := make([]any, len(v))
		for i, sv := range v {
			converted, err := buildValue(sv)
			if err != nil {
				return nil, err
			}
			out[i] = converted
		}
		return out, nil
	default:
		return spec, nil
	}
}

// Tokenization --------------------------------------------------------

var exprTokenRE = regexp.MustCompile(`\s*,?\s*([)(\.]|"(?:\\.|[^"\\])*"|/(?:\\.|[^/\\])*/[a-z]?|[^)(,.\s]+)\s*`)

func tokenize(src string) ([]string, error) {
	if strings.TrimSpace(src) == "" {
		return nil, fmt.Errorf("Shape: empty expression")
	}
	matches := exprTokenRE.FindAllStringSubmatchIndex(src, -1)
	tokens := []string{}
	pos := 0
	for _, m := range matches {
		if m[0] != pos {
			// Found unparseable junk between tokens.
			return nil, fmt.Errorf("Shape: unexpected character at offset %d in expression %q", pos, src)
		}
		pos = m[1]
		tokens = append(tokens, src[m[2]:m[3]])
	}
	if pos != len(src) {
		return nil, fmt.Errorf("Shape: unexpected trailing text in expression %q", src)
	}
	return tokens, nil
}

type exprParser struct {
	tokens []string
	src    string
	i      int
}

// builderRegistry maps builder names to a function that takes parsed args and returns a *Node.
// Two-pass approach: parse expressions first, then dispatch based on builder name.
type builderArg = any

func (p *exprParser) peek() string {
	if p.i >= len(p.tokens) {
		return ""
	}
	return p.tokens[p.i]
}

func (p *exprParser) take() string {
	if p.i >= len(p.tokens) {
		return ""
	}
	t := p.tokens[p.i]
	p.i++
	return t
}

func (p *exprParser) parseFull() (*Node, error) {
	val, err := p.parseTerm(true)
	if err != nil {
		return nil, err
	}
	// chain: . Builder(args)
	for p.peek() != "" {
		if p.peek() == "." {
			p.take()
			val, err = p.parseChained(val)
			if err != nil {
				return nil, err
			}
			continue
		}
		// implicit chain (TS behaviour: continued tokens are sub-builders)
		next, err := p.parseChained(val)
		if err != nil {
			return nil, err
		}
		val = next
	}
	return val, nil
}

// parseTerm parses a single primary: a builder call, type token, literal, or regex.
// If `top` is true and the term is a literal, it's treated as a Default value.
func (p *exprParser) parseTerm(top bool) (*Node, error) {
	head := p.take()
	if head == "" {
		return nil, fmt.Errorf("Shape: unexpected end of expression %q", p.src)
	}
	if head == ")" || head == "(" || head == "." {
		return nil, fmt.Errorf("Shape: unexpected token %s in builder expression %s", head, p.src)
	}

	if fn, ok := getExprBuilders()[head]; ok {
		args, err := p.parseArgs()
		if err != nil {
			return nil, err
		}
		return fn(args)
	}
	if tok, ok := exprTypeTokens[head]; ok {
		args, err := p.parseArgs()
		if err != nil {
			return nil, err
		}
		// A type token with arguments applies the type to them, as TS does
		// (String(Min(2)) is Type('String', Min(2))); the arguments used to be
		// parsed and dropped. Bare, the token's own node is built rather than
		// Required(tok): Any is the one token that does not require a value.
		if len(args) > 0 {
			return Type(tok, exprShapes(args)...), nil
		}
		return newNodeWrap(typeTokenNode(tok.kind)), nil
	}
	if head == "NaN" {
		_, _ = p.parseArgs()
		nb := buildize(nil)
		nb.n.kind = KindNaN
		nb.n.required = true
		return nb, nil
	}
	if head == "undefined" || head == "null" {
		_, _ = p.parseArgs()
		nb := buildize(nil)
		nb.n.kind = KindNull
		return nb, nil
	}
	if strings.HasPrefix(head, "/") && strings.HasSuffix(head, "/") && len(head) >= 2 {
		re, err := regexp.Compile(head[1 : len(head)-1])
		if err != nil {
			return nil, fmt.Errorf("Shape: invalid regexp %q: %w", head, err)
		}
		// A bare /re/ is a type, not a check: a non-string fails as a type
		// error. Check(/re/) is the explicit-check form and reports as one.
		return newNodeWrap(regexpNode(re)), nil
	}
	// JSON literal
	var lit any
	if err := json.Unmarshal([]byte(head), &lit); err == nil {
		if top {
			return Default(lit), nil
		}
		// non-top literal: wrap in a node. json.Unmarshal only produces nil,
		// bool, float64, string, []any or map[string]any, and normalize handles
		// every one of those without error, so no error is possible here.
		n, _ := normalize(lit)
		return newNodeWrap(n), nil
	}

	return nil, fmt.Errorf("Shape: unexpected token %s in builder expression %s", head, p.src)
}

func (p *exprParser) parseChained(carrier *Node) (*Node, error) {
	head := p.take()
	if head == "" {
		return carrier, nil
	}
	if fn, ok := getExprBuilders()[head]; ok {
		args, err := p.parseArgs()
		if err != nil {
			return nil, err
		}
		// Chain: append carrier as final arg unless explicitly provided as the last.
		args = append(args, carrier)
		return fn(args)
	}
	// A type token in chain position sets the type on the carrier, mirroring TS
	// (".Array" is Type('Array') applied to the current node).
	if tok, ok := exprTypeTokens[head]; ok {
		_, _ = p.parseArgs()
		return Type(tok, carrier), nil
	}
	return nil, fmt.Errorf("Shape: unexpected token %s in builder expression %s", head, p.src)
}

// exprApply applies an expression to an existing carrier node, mirroring TS
// expr(src, current) — the builders mutate the carrier in place. Used by
// value expressions (the "$$" keymark) so that e.g. "Open" opens the parent
// object rather than replacing it.
func exprApply(src string, carrier *Node) (*Node, error) {
	tokens, err := tokenize(src)
	if err != nil {
		return nil, err
	}
	p := &exprParser{tokens: tokens, src: src}
	val := carrier
	for p.peek() != "" {
		if p.peek() == "." {
			p.take()
		}
		next, err := p.parseChained(val)
		if err != nil {
			return nil, err
		}
		val = next
	}
	return val, nil
}

// parseArgs reads "( arg, arg, ... )" if next token is "(".
func (p *exprParser) parseArgs() ([]builderArg, error) {
	if p.peek() != "(" {
		return nil, nil
	}
	p.take() // consume "("
	args := []builderArg{}
	for {
		if p.peek() == ")" {
			p.take()
			return args, nil
		}
		if p.peek() == "" {
			return nil, fmt.Errorf("Shape: unclosed argument list in expression %q", p.src)
		}
		arg, err := p.parseArg()
		if err != nil {
			return nil, err
		}
		args = append(args, arg)
	}
}

// parseArg reads one expression-as-arg (a builder, a literal, or a regex).
func (p *exprParser) parseArg() (any, error) {
	head := p.take()
	if head == "" {
		return nil, fmt.Errorf("Shape: unexpected end of expression %q", p.src)
	}

	if fn, ok := getExprBuilders()[head]; ok {
		args, err := p.parseArgs()
		if err != nil {
			return nil, err
		}
		node, err := fn(args)
		if err != nil {
			return nil, err
		}
		return chainContinuation(p, node)
	}
	if tok, ok := exprTypeTokens[head]; ok {
		args, err := p.parseArgs()
		if err != nil {
			return nil, err
		}
		if len(args) > 0 {
			return chainContinuation(p, Type(tok, exprShapes(args)...))
		}
		return chainContinuation(p, newNodeWrap(typeTokenNode(tok.kind)))
	}
	if head == "NaN" {
		nb := buildize(nil)
		nb.n.kind = KindNaN
		nb.n.required = true
		return chainContinuation(p, nb)
	}
	if head == "undefined" || head == "null" {
		return nil, nil
	}
	if strings.HasPrefix(head, "/") && strings.HasSuffix(head, "/") && len(head) >= 2 {
		re, err := regexp.Compile(head[1 : len(head)-1])
		if err != nil {
			return nil, fmt.Errorf("Shape: invalid regexp %q: %w", head, err)
		}
		return re, nil
	}
	// JSON literal
	var lit any
	if err := json.Unmarshal([]byte(head), &lit); err == nil {
		return lit, nil
	}
	return nil, fmt.Errorf("Shape: unexpected token %s in builder expression %s", head, p.src)
}

func chainContinuation(p *exprParser, carrier *Node) (any, error) {
	for p.peek() == "." {
		p.take()
		next, err := p.parseChained(carrier)
		if err != nil {
			return nil, err
		}
		carrier = next
	}
	return carrier, nil
}

// Builder dispatch --------------------------------------------------

var exprTypeTokens = map[string]TypeToken{
	"Any":      Any,
	"String":   String,
	"Number":   Number,
	"Boolean":  Boolean,
	"Object":   Object,
	"Array":    Array,
	"Function": Function,
	"Integer":  Integer,
	"Date":     Date,
}

type exprBuilderFn func(args []builderArg) (*Node, error)

// exprBuilders is lazily populated to avoid a Go package initialization cycle
// (normalize → Expr → builder funcs → normalize).
var (
	exprBuildersOnce sync.Once
	exprBuilders     map[string]exprBuilderFn
)

func getExprBuilders() map[string]exprBuilderFn {
	exprBuildersOnce.Do(func() {
		exprBuilders = buildExprBuilders()
	})
	return exprBuilders
}

func buildExprBuilders() map[string]exprBuilderFn {
	return map[string]exprBuilderFn{
	"Required": variadicNode(Required),
	"Optional": variadicNode(Optional),
	"Open":     variadicNode(Open),
	"Closed":   variadicNode(Closed),
	"Skip":     variadicNode(Skip),
	"Ignore":   variadicNode(Ignore),
	"Empty":    variadicNode(Empty),
	"Never":    variadicNode(Never),
	"Func":     variadicNode(Func),
	"Nullable": variadicNode(Nullable),
	"Coerce":   variadicNode(Coerce),
	"Partial":  variadicNode(Partial),
	"Email":    variadicNode(Email),
	"Url":      variadicNode(Url),
	"Uuid":     variadicNode(Uuid),
	"DateTime": variadicNode(DateTime),
	"Ip":       variadicNode(Ip),
	"Ipv4":     variadicNode(Ipv4),
	"Ipv6":     variadicNode(Ipv6),

	"Default": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Default: missing default value")
		}
		dval := args[0]
		spec := args[1:]
		return Default(dval, exprShapes(spec)...), nil
	},
	"Pick": func(args []builderArg) (*Node, error) {
		names, err := exprNames("Pick", args)
		if err != nil {
			return nil, err
		}
		return Pick(names, exprShapes(args[1:])...), nil
	},
	"Omit": func(args []builderArg) (*Node, error) {
		names, err := exprNames("Omit", args)
		if err != nil {
			return nil, err
		}
		return Omit(names, exprShapes(args[1:])...), nil
	},
	"Extend": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Extend: missing shape to add")
		}
		return Extend(exprShapes(args[:1])[0], exprShapes(args[1:])...), nil
	},
	"Catch": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Catch: missing fallback value")
		}
		return Catch(args[0], exprShapes(args[1:])...), nil
	},
	"Describe": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Describe: missing description")
		}
		msg, ok := args[0].(string)
		if !ok {
			return nil, fmt.Errorf("Describe: description must be a string")
		}
		return Describe(msg, exprShapes(args[1:])...), nil
	},
	"Fault": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Fault: missing message")
		}
		msg, ok := args[0].(string)
		if !ok {
			return nil, fmt.Errorf("Fault: message must be a string")
		}
		spec := args[1:]
		return Fault(msg, exprShapes(spec)...), nil
	},
	"Type": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Type: missing kind")
		}
		return Type(args[0], exprShapes(args[1:])...), nil
	},
	"Exact": func(args []builderArg) (*Node, error) {
		return Exact(args...), nil
	},
	"Min": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Min: missing limit")
		}
		return Min(args[0], exprShapes(args[1:])...), nil
	},
	"Max": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Max: missing limit")
		}
		return Max(args[0], exprShapes(args[1:])...), nil
	},
	"Above": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Above: missing limit")
		}
		return Above(args[0], exprShapes(args[1:])...), nil
	},
	"Below": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Below: missing limit")
		}
		return Below(args[0], exprShapes(args[1:])...), nil
	},
	"Len": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Len: missing length")
		}
		n, ok := toInt(args[0])
		if !ok {
			return nil, fmt.Errorf("Len: length must be integer")
		}
		return Len(n, exprShapes(args[1:])...), nil
	},
	"Check": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Check: missing checker")
		}
		return Check(args[0], exprShapes(args[1:])...), nil
	},
	"One": func(args []builderArg) (*Node, error) {
		return One(exprShapes(args)...), nil
	},
	"Some": func(args []builderArg) (*Node, error) {
		return Some(exprShapes(args)...), nil
	},
	"All": func(args []builderArg) (*Node, error) {
		return All(exprShapes(args)...), nil
	},
	"Child": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Child: missing child shape")
		}
		return Child(exprShape(args[0]), exprShapes(args[1:])...), nil
	},
	"Rest": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Rest: missing child shape")
		}
		return Rest(exprShape(args[0]), exprShapes(args[1:])...), nil
	},
	"Define": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Define: missing name")
		}
		name, ok := args[0].(string)
		if !ok {
			return nil, fmt.Errorf("Define: name must be string")
		}
		return Define(name, exprShapes(args[1:])...), nil
	},
	"Refer": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Refer: missing name")
		}
		name, ok := args[0].(string)
		if !ok {
			return nil, fmt.Errorf("Refer: name must be string")
		}
		return Refer(name, exprShapes(args[1:])...), nil
	},
	"Rename": func(args []builderArg) (*Node, error) {
		if len(args) < 1 {
			return nil, fmt.Errorf("Rename: missing name")
		}
		name, ok := args[0].(string)
		if !ok {
			return nil, fmt.Errorf("Rename: name must be string")
		}
		return Rename(name, exprShapes(args[1:])...), nil
	},
		"Key": func(args []builderArg) (*Node, error) {
			return Key(args...), nil
		},
	}
}

// variadicNode wraps a builder of signature `func(spec ...any) *Node` for the
// expression dispatcher.
func variadicNode(fn func(spec ...any) *Node) exprBuilderFn {
	return func(args []builderArg) (*Node, error) {
		return fn(exprShapes(args)...), nil
	}
}

// exprNames reads a builder's leading list-of-property-names argument. The
// tokenizer takes a single-element array literal only, in both languages
// alike, so ["a","b"] is a parse error before it ever reaches here.
func exprNames(builder string, args []builderArg) ([]string, error) {
	if len(args) < 1 {
		return nil, fmt.Errorf("%s: missing property names", builder)
	}
	arr, ok := args[0].([]any)
	if !ok {
		return nil, fmt.Errorf("%s: property names must be an array", builder)
	}
	out := make([]string, 0, len(arr))
	for _, v := range arr {
		s, ok := v.(string)
		if !ok {
			return nil, fmt.Errorf("%s: property names must be strings", builder)
		}
		out = append(out, s)
	}
	return out, nil
}

// exprShapes converts arguments that sit in a shape position. A bare `null`
// parses to Go nil, which buildize reads as "no shape given"; in a shape
// position it is the null *type*, matching TS nodize(null). As a value argument
// — Exact(1,null), Default(null) — it stays nil.
func exprShapes(args []builderArg) []any {
	out := make([]any, len(args))
	for i, a := range args {
		if a == nil {
			out[i] = newNodeWrap(&node{kind: KindNull})
			continue
		}
		out[i] = a
	}
	return out
}

// exprShape is exprShapes for a single argument.
func exprShape(a builderArg) any {
	return exprShapes([]builderArg{a})[0]
}

func toInt(v any) (int, bool) {
	switch x := v.(type) {
	case int:
		return x, true
	case int8:
		return int(x), true
	case int16:
		return int(x), true
	case int32:
		return int(x), true
	case int64:
		return int(x), true
	case uint:
		return int(x), true
	case uint8:
		return int(x), true
	case uint16:
		return int(x), true
	case uint32:
		return int(x), true
	case uint64:
		return int(x), true
	case float32:
		return int(x), true
	case float64:
		return int(x), true
	}
	return 0, false
}
