---
title: "Cyclist Blind-Spot Monitor"
slug: "blind-spot-monitor"
order: 5
status: outline
subtitle: "A LIDAR-based rear detector for a bicycle. Cars approach faster than you can hear them, and a mirror only helps when you are already looking."
tags: ["LIDAR", "Embedded", "Sensors"]
hero: "images/projects/blind-spot/hero.jpg"
heroCaption: "The unit mounted under the saddle."
#
# SHOT LIST:
#   1. images/projects/blind-spot/hero.jpg     the unit mounted on the bike
#   2. images/projects/blind-spot/bench.jpg    the electronics on the bench, wired up
#   3. images/projects/blind-spot/alert.jpg    the rider-facing indicator, showing an alert
#   4. images/projects/blind-spot/cad.png      enclosure model
#
# NEEDS FROM JASON — this is the thinnest page on the site and the most technical:
#   - Which LIDAR module, and what range you got out of it in daylight
#   - How you tell an approaching car from a parked one (closing rate? thresholding?)
#   - What the rider actually sees or feels when it fires
#   - Microcontroller, power source, and how long it runs
#   - False positives. What sets it off that should not?
---

Riding on open road, a car behind you registers late. A mirror works if you are looking at
it, and you are usually looking at the road.

So I put a LIDAR module behind the saddle and had it watch the lane behind me.

*This one needs a real write-up. The technical detail listed in the frontmatter is what
would make it worth reading, and none of it is documented anywhere I can reach.*
