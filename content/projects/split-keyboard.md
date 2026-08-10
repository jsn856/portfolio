---
title: "Low Profile Split Keyboard"
slug: "split-keyboard"
order: 4
status: outline
subtitle: "An Allium58, built twice and used daily. A number pad kit proved I could do it, and a Lily58 taught me what I did not want."
tags: ["Electronics", "Soldering", "QMK"]
hero: "images/projects/keyboard/hero.jpg"
heroCaption: "Both halves of the Allium58."
#
# SHOT LIST:
#   1. images/projects/keyboard/progression.jpg  numpad + Lily58 + Allium58 together
#   2. images/projects/keyboard/hero.jpg         both Allium58 halves, top-down, keycaps on
#   3. images/projects/keyboard/profile.jpg      side-on, showing the height off the desk
#   4. images/projects/keyboard/keymap.png       layer diagram (QMK configurator exports one)
#
# #1 is the most valuable photo on the page. Three boards in a row IS the story: cheap
# test, first attempt, the one that stuck. Nothing else shows that in a single frame.
#
# The profile shot still matters. "Low profile" is invisible in a top-down photo.
#
# STILL NEEDS:
#   - The keycap set by name, if you want to credit it
#   - How long before you typed at full speed again
#   - Whether the second Allium differs from the first in any way
---

A split keyboard leaves each hand where it already rests instead of asking both to meet in
the middle. Low profile keeps the whole thing close to the desk, so your wrists stop
climbing over it.

Getting there took three boards.

![The number pad kit, the Lily58, and the Allium58](images/projects/keyboard/progression.jpg "Left to right: the test, the first attempt, the one I kept.")

## Proving it was possible

Before ordering anything I cared about, I bought a DIY number pad kit off Amazon. Twenty
or so switches, a small PCB, an evening of work. It cost almost nothing and answered the
only question that mattered: could I do this at all.

That is the same call I would make on a program with real money behind it. Build the cheap
thing that de-risks the expensive thing, and find out early rather than halfway through.

## Lily58

First real build. Vendor PCB, wired, and it worked.

It was also wobbly and it sounded terrible. The keys had play in them, and the case rang
hollow under typing. Neither of those is something you find out by reading about switches,
and neither gets better with use.

## Allium58

A low-profile fork of the Lily58, and the one that stuck. Gateron Browns, a keycap set I
liked looking at, and none of the wobble.

I built two, both wired, both from vendor PCBs. One lives at home and one at the office,
so I am typing on the same layout either way. I use them daily.

![Side-on view showing the height off the desk](images/projects/keyboard/profile.jpg "How low it actually sits.")

## The keymap

Two layers, written in QMK and flashed to both boards.

The base layer holds what you would expect. The second one carries arrow keys, a number pad
under the right hand, function keys, and the symbols that sit too far from home position on
a normal board.

QMK keymaps are C. I defined the layers as arrays, compiled, and flashed the result, so
moving a key means recompiling and reflashing rather than dragging it in a GUI. That sounds
worse than it is, and it means the layout lives in version control with everything else.

![Keymap layer diagram](images/projects/keyboard/keymap.png "The layer map.")

## Where this came from

I could not solder when I started. I learned at work, made a
[case for the iron](/projects/pinecil-case/), then built a
[fume extractor](/projects/fume-extractor/) once I was using it enough for the smoke to
matter. A board with a few hundred joints in it was the next thing that looked out of
reach.
