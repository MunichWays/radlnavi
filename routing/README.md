# RadlNavi Backend

This is the routing backend for [radlnavi.de](https://www.radlnavi.de).

## Seasonal bicycle access

The bicycle profile observes recurring seasonal prohibitions such as
`bicycle:conditional=no @ (Jul 01 - Oct 22)`. This example applies to the
Theresienwiese, which is closed to bicycle traffic in connection with the
Oktoberfest. The condition is evaluated when `osrm-extract` builds the static
routing graph. The regular monthly RadlNavi build refreshes the evaluated
restriction after a seasonal boundary.

Only `no @ (Mon DD - Mon DD)` month/day ranges are currently supported.
Unsupported conditions (for example weekdays, times, explicit years, or
weather) are ignored rather than risking an incorrect road closure.

For reproducible imports, set `RADLNAVI_ROUTING_DATE=YYYY-MM-DD` during
`osrm-extract`. If it is not set, the current date is used.

Run the focused unit tests from this directory with
`lua test_conditional_access.lua`.
