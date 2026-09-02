package shape

import (
	"fmt"
	"regexp"
	"strings"
)

// String formats: Email, Url, Uuid, DateTime, Ip, Ipv4, Ipv6. Every pattern
// here is written so that RE2 and the JavaScript engine agree on it: ASCII
// classes only, no lookaround, explicit whitespace.

// A pragmatic RFC 5322 addr-spec: a dot-atom local part of at most 64
// characters, then a dotted domain ending in an alphabetic top-level label,
// 254 characters in all. No quoted local parts, no address literals.
var emailRE = regexp.MustCompile("^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*" +
	"@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}$")

func isEmail(s string) bool {
	return len(s) <= 254 && strings.IndexByte(s, '@') <= 64 && emailRE.MatchString(s)
}

// scheme://[user@]host[:port][/path][?query][#fragment]: an absolute URL with
// a non-empty host and no whitespace. Nothing is decoded or resolved.
var urlRE = regexp.MustCompile(
	`^[A-Za-z][A-Za-z0-9+.-]*://(?:[^ \t\r\n/?#@]+@)?(?:\[[0-9A-Fa-f:.]+\]|[^ \t\r\n/?#@:\[\]]+)(?::\d{1,5})?(?:[/?#][^ \t\r\n]*)?$`)

// 8-4-4-4-12 hex digits; any version, including the nil UUID.
var uuidRE = regexp.MustCompile(
	`^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$`)

// A dotted quad of decimal octets 0-255 without leading zeros.
var ipv4RE = regexp.MustCompile(
	`^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$`)

var hex4RE = regexp.MustCompile(`^[0-9A-Fa-f]{1,4}$`)

// isIpv6 accepts the RFC 4291 text form: eight 16-bit hex groups, one
// optional "::" standing for a run of zero groups, and optionally a trailing
// dotted quad in place of the last two groups. No zone index and no prefix
// length.
func isIpv6(s string) bool {
	parts := strings.Split(s, "::")
	if len(parts) > 2 {
		return false
	}

	var head, tail []string
	if parts[0] != "" {
		head = strings.Split(parts[0], ":")
	}
	if len(parts) == 2 && parts[1] != "" {
		tail = strings.Split(parts[1], ":")
	}
	groups := append(append([]string{}, head...), tail...)

	count := 0
	for i, g := range groups {
		switch {
		case hex4RE.MatchString(g):
			count++
		// A dotted quad may only end the address, so not ahead of a "::".
		case i == len(groups)-1 && (len(parts) == 1 || len(head) <= i) && ipv4RE.MatchString(g):
			count += 2
		default:
			return false
		}
	}

	if len(parts) == 2 {
		return count <= 7
	}
	return count == 8
}

// format describes one string format builder.
type format struct {
	name  string // builder name, and the why-code of its error
	what  string // the noun in "is not a valid <what>"
	valid func(string) bool
}

var (
	fmtEmail    = format{WhyEmail, "email address", isEmail}
	fmtUrl      = format{WhyUrl, "URL", urlRE.MatchString}
	fmtUuid     = format{WhyUuid, "UUID", uuidRE.MatchString}
	fmtDateTime = format{WhyDateTime, "ISO 8601 date-time", isoDateTime}
	fmtIp       = format{WhyIp, "IP address", func(s string) bool { return ipv4RE.MatchString(s) || isIpv6(s) }}
	fmtIpv4     = format{WhyIpv4, "IPv4 address", ipv4RE.MatchString}
	fmtIpv6     = format{WhyIpv6, "IPv6 address", isIpv6}
)

// A format is a before on a string-shaped node. It speaks only once the value
// is known to be present and of the node's kind; otherwise the structural
// check reports the real problem.
func formatValidator(f format) validator {
	return validator{
		name: f.name,
		fn: func(val any, update *Update, state *State) bool {
			if state.absent || typeWillFail(state.Node, val) {
				return true
			}
			if s, ok := val.(string); ok && f.valid(s) {
				return true
			}
			update.Err = makeErr(state, f.name, 0,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" is not a valid %s.", f.what))
			return false
		},
		stringify: func() string { return f.name },
	}
}

// withFormat adds the format check. A format is a shape of string, so an
// untyped node becomes one first.
func (n *Node) withFormat(f format) *Node {
	if n.n.kind == KindAny {
		Type(String, n)
	}
	n.n.befores = append(n.n.befores, formatValidator(f))
	bumpValidatorGen()
	return n
}

func formatNode(f format, spec []any) *Node {
	if len(spec) == 0 {
		return buildize(nil).withFormat(f)
	}
	return buildize(spec[0]).withFormat(f)
}

// Email accepts a string in email address form: a dot-atom local part and a
// dotted domain (no quoted local parts or address literals).
func Email(spec ...any) *Node { return formatNode(fmtEmail, spec) }

// Email (chained).
func (n *Node) Email() *Node { return n.withFormat(fmtEmail) }

// Url accepts an absolute URL: scheme://host with optional user, port, path,
// query and fragment.
func Url(spec ...any) *Node { return formatNode(fmtUrl, spec) }

// Url (chained).
func (n *Node) Url() *Node { return n.withFormat(fmtUrl) }

// Uuid accepts a UUID in 8-4-4-4-12 hex form, any version.
func Uuid(spec ...any) *Node { return formatNode(fmtUuid, spec) }

// Uuid (chained).
func (n *Node) Uuid() *Node { return n.withFormat(fmtUuid) }

// DateTime accepts a strict ISO 8601 / RFC 3339 date-time string. The value
// stays a string; Coerce(Date) is the one that produces a time.Time.
func DateTime(spec ...any) *Node { return formatNode(fmtDateTime, spec) }

// DateTime (chained).
func (n *Node) DateTime() *Node { return n.withFormat(fmtDateTime) }

// Ip accepts an IPv4 or IPv6 address.
func Ip(spec ...any) *Node { return formatNode(fmtIp, spec) }

// Ip (chained).
func (n *Node) Ip() *Node { return n.withFormat(fmtIp) }

// Ipv4 accepts a dotted-quad IPv4 address.
func Ipv4(spec ...any) *Node { return formatNode(fmtIpv4, spec) }

// Ipv4 (chained).
func (n *Node) Ipv4() *Node { return n.withFormat(fmtIpv4) }

// Ipv6 accepts an IPv6 address in RFC 4291 text form.
func Ipv6(spec ...any) *Node { return formatNode(fmtIpv6, spec) }

// Ipv6 (chained).
func (n *Node) Ipv6() *Node { return n.withFormat(fmtIpv6) }
