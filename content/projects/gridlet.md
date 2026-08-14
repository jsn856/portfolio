---
title: "Gridlet"
year: "2026"
order: 1
subtitle: "My wife and I lost our daily crossword to a paywall. Four months later I had a word bank, a puzzle generator and an iOS app in review, and I still cannot write a line of Swift."
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
# PLACED: hero.png as the hero, editor.png under the browser tools paragraph, and
# hero+dark as a light/dark pair in the palette paragraph. That puts roughly one visual
# per chapter, with ACETYL and Conducting left unbroken on purpose.
#
# icon.png is NOT placed. A 1024 square renders badly at prose width and there is no
# paragraph it belongs under. Leave it out unless you want a 3-up gallery.
#
# hero.png appears twice on purpose (hero, then the light/dark pair). If that reads as
# repetition once the real shots exist, take a separate light.png of a different puzzle
# and swap it into the @gallery.
#
# NOTE: the gridlet clone on this Windows machine is stale (last commit 2026-04-03).
# Real source is on the Mac. Do not verify figures against the local clone.
#
# NOTE: "in review" goes stale the moment Apple decides. Two places: the subtitle above,
# and the "Twenty builds later, Gridlet is under review" line in "What actually got built".
---

My wife and I played the New York Times mini crossword every day. It was a small thing. She
would send me her time, I would send her mine, and hers was almost always faster. Not by a
little.

In August 2025 the Times moved the mini behind the paywall, and that was the end of it.

I figured I would forget about it in a week. Months later I was still annoyed. The puzzle
itself was maybe four minutes of my day. What I missed was the part after, the two of us
comparing times, which had turned into one of the more dependable things we did together
without either of us deciding it would be.

Then sometime last winter I had the thought that got me here. I bet I could build a better
one.

That is a petty reason to start a project and I am aware of it. But I had been looking for
an excuse to build something end to end, and this one came with a user base of two people I
already knew.

## What I thought I was building

In late March I sat down with Claude and started working out what this would actually take.
That conversation ran about a week. Not a week of work. A week of thinking out loud, going
away, coming back with a new objection, and picking it apart again.

What came out of it was a design spec, a build plan, and the first real artifact of the
project.

@diagram images/projects/gridlet/architecture-planned.svg | The architecture I drew in March, before any of it existed.

I still like this diagram, mostly because of how wrong it is.

It has a REST API, a puzzle database using Supabase or Firebase. It has Sign in with Apple,
marked optional, which is the tell of someone who has not thought about it. It has a
leaderboard. It has a cron job publishing a puzzle every morning.

I was drawing the system I assumed a daily puzzle app had to be, because that is what daily
puzzle apps look like from the outside. Almost none of it survived.

What the plan did get right was the shape of the work. Four things had to exist, and each one
fed the next. A bank of words and clues. A program to turn that bank into puzzles. Somewhere
to put the puzzles. An app to play them in.

Here is the part I should put up front, because it changes how the rest of this reads. I did
not write any code. Not one line. I do not know Swift and I do not know JavaScript, and
after four months of this I still don't. Every line of the generator, the browser tools and
the app came out of Claude.

What I did was decide what the thing should feel like, which of two approaches to take, what
was wrong with whatever came back, and when something that ran correctly was still the wrong
answer. There was an enormous amount of back and forth. That back and forth is most of what
this project actually was.

## Nobody wants ACETYL at seven in the morning

The word bank came first, since nothing downstream works without it. I went looking for
sources and turned up an open word list and a dataset of historical crossword clues. Claude
wrote the script that merged them into one JSON file keyed by answer.

Then I ran the generator for the first time and got a grid full of words like ELAN, VAPID and
ACETYL.

Technically valid. Genuinely a crossword. Also miserable to solve before coffee.

The explanation was easy enough to get. A solver treats every word in the bank as equally
acceptable, so it fills the grid with whatever satisfies the constraints, and rare words
satisfy constraints beautifully. They are full of unusual letters, which makes crossings
easier to find. Nothing was malfunctioning. The generator was doing exactly what it had been
asked to do, and I was the one who had asked for the wrong thing.

Noticing it was a problem at all is the part that was mine. A grid full of ACETYL and ELAN is
a correct crossword. It is only a bad one if you know who is going to be sitting there at
seven in the morning trying to solve it.

So the bank needed a difficulty rating, and difficulty turned out to be two separate
questions.

The first one is how obscure the word is. That came from SUBTLEX-US, a corpus built out of
the subtitles of 8,388 films and television episodes, about 51 million words of American
dialogue, counted by how often each word turns up. If you have heard a word out loud, it
scores well. BEACH, CITY and EVER sit near the top. VAPID and ACETYL do not.

The second question is harder. How tricky is the clue? A plain word can carry a devious clue
and a rare word can carry a flat one, so knowing the word tells you nothing about the clue
attached to it. There is no corpus for that. So I ran the whole bank through Anthropic's
Batch API and had a model rate every clue on misdirection, wordplay, indirectness and the
knowledge it assumes, anchored to the NYT convention where a 1 is a Monday and a 5 is a
Saturday.

Before committing to the full run I tested Haiku and Sonnet against the same 500 words. On
word difficulty they agreed, but on clues they did not. The example that decided it was
ACAPULCO, clued as "Place with many dives in Mexico." Haiku read "dives" as diving and rated
it a 1. Sonnet caught the second meaning, rated it a 4, and was right. Haiku also dropped
clues out of its output more often, 29 mismatches against Sonnet's 2.

I paid for Sonnet.

The finished bank is 103,128 words carrying about a dozen clues each.

## Arguing with robots

The generator is a single Node script, somewhere north of seventeen hundred lines, and I
could not have written ten of them. It picks a black square pattern for the grid size, finds
every across and down run of three or more cells, and fills them by backtracking.

Backtracking is what you already do on a crossword when you are being stubborn about it. Put
a word in. Try to put a crossing word in. If nothing fits, pull the first word back out, try
a different one, and go again. The computer does the same thing a few hundred thousand times
without getting bored or attached to any of its guesses.

There are two things that keep that from taking all day. It always fills the most constrained
slot first, so it runs into the hard part of the grid early instead of discovering it after
twenty successful placements. And every time it places a word it filters the candidate lists
of every slot crossing it. If one of those drops to zero options, it backs out right there
rather than building further on a grid that cannot finish.

How it hits a difficulty target is my favorite part of the whole thing, and it came out of an
argument I lost to this robot.

My instinct was to force it. Restrict the word pool so tightly that only an easy puzzle can
come out the other side. Claude talked me out of it. Squeezing the pool that hard fights the
solver, and a solver that cannot find a valid fill is a solver that runs forever.

What we landed on instead is closer to rolling dice. Every word gets a random sort key
divided by a weight based on its difficulty, so easy words tend to get tried first without
rare words ever leaving the pool. The generator fills the grid, scores the average difficulty
of what it produced, and if the number lands outside the band I asked for, it throws the
entire puzzle away and starts over with a freshly shuffled pool. Each attempt takes a second
or two. Rolling again is cheaper than negotiating.

It started at 5×5. It handles up to 10×10 now.

Once a puzzle is good it gets encrypted with AES-256-GCM before it ships, which is not real
security and was never meant to be. The key is a passphrase sitting in the app, and anyone
willing to open the binary will find it. It exists so tomorrow's answers are not sitting in
plain text for anyone who thinks to open the file, which is the only threat I actually have.

What I did not plan for is that none of this is inspectable by hand. You cannot eyeball
103,128 words, and you cannot judge a puzzle by reading its JSON. So the generator grew a set
of browser tools around it. Single page HTML, no build step, all of them written by Claude
against a running list of complaints from me: an editor for swapping and rating clues, a
reviewer for combing through the clue bank, a viewer that opens both encrypted and raw files,
and a builder that assembles the generator's command line flags so I stop mistyping them. All
keyboard driven, because I knew I would be living in them.

![The browser puzzle editor with a grid loaded](images/projects/gridlet/editor.png "The puzzle editor, one of four browser tools.")

## Learning to ask

The puzzles needed to live somewhere, and this is where the diagram started coming apart. I
put them in a private GitHub repo.

This was my first real use of git, and calling it a learning curve undersells it. I
understood commits. I did not understand branches, or what merging actually did to my files,
or why my terminal had opened vim and would not give it back.

Then the app. I have started Xcode projects before and abandoned all of them. This one is a
SwiftUI app of real size, and Claude wrote essentially all of it. Grid rendering that adapts
to any size instead of assuming 5×5. Cell selection and the across/down toggle. The clue
list. The timer, which waits for your first tap instead of starting on load. Stats and play
state syncing through iCloud. The completion confetti.

It designed the look, too. I said calm, pastel, something you would not mind looking at
before you are properly awake, and then rejected options until one of them was right. The
sage green, the rounded corners, the typefaces, the app icon. I set the direction and I threw
a lot of it back.

@gallery images/projects/gridlet/hero.png, images/projects/gridlet/dark.png | The same solved mini, light and dark.

I spent most of that stretch somewhere between impressed and unsettled.

It was not hands off. I rejected a lot, sent a lot back, and caught a fair number of things
that looked right and were not. What I got better at over those weeks is the part that was
actually mine: being specific about what I wanted, naming which files not to touch, checking
the output instead of trusting it, and keeping the context small enough that the model still
knew what project it was working on. Vague instructions produce a great deal of confident,
wrong code.

## What actually got built

@diagram images/projects/gridlet/architecture-actual.svg | What shipped. Everything in the middle of the first diagram is gone.

No API. No database. No auth, optional or otherwise. No leaderboard. No cron.

The generator writes encrypted JSON files. I push them. GitHub Pages serves them as static
files. The app downloads what it needs, decrypts it with CryptoKit and caches it, so once a
puzzle is on your phone it works with no connection at all.

Everything in the middle of that first diagram was infrastructure for problems I turned out
not to have. There are no accounts, so there is nothing to authenticate. There is no
leaderboard, so there is nothing to write to. The puzzles never change after I make them,
which makes them files, and files do not need a database in front of them. Publishing is a
git push.

That unraveling is a key part of the project. I drew the first diagram before I knew
which parts of this were going to be hard.

I put it on TestFlight, which is Apple's beta platform, and handed it out to friends and
family.

They found things. Some were bugs. More were the kind you cannot see in your own app, where
whatever is obvious to the person who built it turns out to be obvious to nobody else.
Puzzles came back harder than the label I had put on them. The onboarding did not explain
enough. There was friction in the input handling I had stopped noticing months earlier.

Twenty builds later, Gridlet is under review for the App Store.

It is free. No ads, no accounts, no analytics, nothing collected. A mini every day at 5×5,
6×6 or 7×7, and a larger midi on Sundays and Wednesdays, all running on a repeating fourteen
day schedule. There is an archive of everything already published, and a share format built
around streaks rather than solve times, because nobody wants to broadcast how long a 5×5 took
them. My wife has it on her phone. She is still faster than me.

## Conducting

What this felt like, more than anything, was being a music conductor.

I had a version of the song in my head. Each musician in front of me knew how to play their
part better than I could play it. What was left for me was the shape of the whole thing and
the seams between the parts, and the seams are where all the interesting problems were. The
clue bank has to produce exactly what the generator expects. The generator has to produce
exactly what the app can decrypt and render. Get one of those handoffs wrong and it stops
mattering how well any single piece was written.

Claude wrote code I could not read and would not have known was wrong. But it did not know
the puzzle needed to be enjoyable at seven in the morning. Claude did not know ACETYL was the
wrong answer even though it was a correct one. It never told me the leaderboard was a bad
idea, because I never thought to ask. Those were mine, and they turned out to be most of the
decisions that mattered.

I have avoided adding up what I spent on Claude subscriptions and API credits to get out of a
five dollar a month crossword subscription. I know roughly where the number is and I know which
side of it I am on. I would do it again.

Thanks for reading.
