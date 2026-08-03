local conditional_access = require("conditional_access")

local function assert_result(value, date, expected_forbidden, expected_supported)
  local actual, supported = conditional_access.bicycle_is_forbidden(value, date)
  assert(actual == expected_forbidden,
    string.format("expected %s for %q on %04d, got %s",
      tostring(expected_forbidden), tostring(value), date, tostring(actual)))
  assert(supported == expected_supported,
    string.format("expected supported=%s for %q, got %s",
      tostring(expected_supported), tostring(value), tostring(supported)))
end

assert_result(nil, 801, false, true)
assert_result("no @ (Jul 01 - Oct 22)", 630, false, true)
assert_result("no @ (Jul 01 - Oct 22)", 701, true, true)
assert_result("no @ (Jul 01 - Oct 22)", 1001, true, true)
assert_result("no @ (Jul 01 - Oct 22)", 1022, true, true)
assert_result("no @ (Jul 01 - Oct 22)", 1023, false, true)

-- A range crossing New Year is supported.
assert_result("no @ (Nov 01 - Mar 31)", 101, true, true)
assert_result("no @ (Nov 01 - Mar 31)", 701, false, true)
assert_result("no @ (Nov 01 - Mar 31)", 1201, true, true)

-- Top-level clauses may be combined, while complex conditions remain ignored.
assert_result("no @ (Jan 01 - Jun 30); no @ (Jul 01 - Oct 22)", 801, true, true)
assert_result("no @ (Mo 08:00-10:00; Tu 09:00-11:00)", 801, false, false)
assert_result("no @ (2026 Jul 01 - 2026 Oct 22)", 801, false, false)
assert_result("no @ (Feb 30 - Mar 01)", 301, false, false)
assert_result("private @ (Jul 01 - Oct 22)", 801, false, false)

print("conditional_access tests passed")
