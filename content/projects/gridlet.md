---
title: "Gridlet"
year: "2026"
order: 1
status: outline
subtitle: "A daily crossword for iOS. SwiftUI app, Node generator, a 103,128-word clue bank rated through the Anthropic Batch API, and encrypted puzzle delivery."
tags: ["iOS", "SwiftUI", "Node.js"]
hero: "images/projects/gridlet/hero.png"
heroCaption: "Gridlet on iOS."
#
# SHOT LIST — all of these live on the Mac:
#   1. images/projects/gridlet/hero.png      app screenshot, a solved mini, light mode
#   2. images/projects/gridlet/dark.png      the same screen in dark mode
#   3. images/projects/gridlet/editor.png    the browser puzzle editor with a grid loaded
#   4. images/projects/gridlet/icon.png      the 1024 app icon (already in the gridlet repo)
#
# A light/dark pair side by side sells the design system faster than either alone.
#
# NOTE: the gridlet clone on this Windows machine is stale (last commit 2026-04-03).
# Real source is on the Mac. Do not verify figures against the local clone.
---

## The product

Daily crosswords for iOS. Minis most days at 5×5, 6×6 and 7×7, with midis on a fixed
cadence: 9×9 on Sundays, 10×10 on Wednesdays. The whole schedule runs a repeating 14-day
cycle.

Daily puzzles stay free. No ads, no accounts, no data collection.

## The pipeline

A Node generator builds the puzzles, with separate difficulty thresholds and weights for
minis and midis. Mini thresholds break midi generation outright, because longer words
change what counts as hard.

Puzzles move through `pzlRaw` for unencrypted review, then `pzlStaged`, then `pzlRelease`,
where I encrypt them with AES-256-GCM and strip the filenames. The app fetches them as
encrypted JSON and decrypts with CryptoKit.

## The clue bank

103,128 words, 99.86% of them rated, scored through the Anthropic Batch API. Two
independent scales: `answerDifficulty` for how familiar the answer is, and a separate clue
difficulty for how tricky the wording is. Answer difficulty drives the schedule.

147 words are still unrated.

## The tools I had to build first

None of the above is inspectable by hand at that scale, so the generator came with a
browser-based puzzle editor for swapping and rating clues, a clue bank reviewer, a viewer
that reads both encrypted and raw JSON, and a command builder that wraps the generator CLI
flags.

## Where it stands

TestFlight build uploaded, privacy policy live, store description drafted, pre-submission
checklist worked. The iOS 26 SDK requirement is what sets the timing on submission.

Next up: a StoreKit tip jar, a Gridlet+ tier covering the archive and extended stats, and a
streak-based share.
