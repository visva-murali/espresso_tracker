# Espresso Shot Tracker — Project Spec

## Vision
A tool for dialing in espresso shots by logging inputs (grind, dose) against outputs (yield, time), paired eventually with computer-vision analysis of the pour itself — growing into a broader coffee companion (milk steaming, latte art) that other espresso lovers can use too.

---

## MVP (v1)

### Core Loop
Log what you controlled, measure what came out, see the pattern over time:
- **Inputs:** grind setting, dose (g in)
- **Outputs:** yield (g out), pull time (s)
- **Context:** bean/origin, roast date, rating or tasting note — all optional
- **Media:** a video of the pour, attached to the shot record (stored, not yet analyzed)

### Who it's for
Multi-user from day one — anyone can sign up and get their own private shot log. This is just auth + a `user_id` on the data, not a "feature" to build later. No sharing, feeds, or social features in v1; everyone's data is isolated to them.

### What "done" looks like for v1
*(Still open — worth nailing down before build starts.)* Rough shape: log a shot in under 30 seconds from a phone, see a list of past shots, and the data is still there tomorrow from any device.

### Explicitly Out of Scope for v1
- Any CV analysis of the pour video (channeling detection, flow/color curves)
- Recommendations or ML of any kind
- Social features — friend connections, shared feeds, leaderboards
- Milk steaming or latte art modules
- Hardware/grinder integration

---

## Future Roadmap

### Phase 2 — CV Pour Analysis
Process the stored pour videos: flow rate over time, color/brightness shift (dark → blonde), channeling detection. Turns the video from a record into a signal.

### Phase 3 — Recommendation / "Barista Assistant"
Combine shot history + bean profile + CV features to suggest grind/dose adjustments. Long-term, this could be a conversational agent you check in with after each shot rather than a static dashboard.

### Phase 4 — Social & Multi-User Features
The actual social layer: friends and other espresso lovers seeing each other's shots, shared feeds, maybe leaderboards or community challenges. (Distinct from the multi-user *account* support already in v1 — this is about connecting users to each other.)

### Phase 5 — Milk Steaming Analysis
Capture audio + video of steaming milk. Audio signal indicates technique (pitcher sound changes as texture develops); video checks consistency/microfoam quality. Feedback on whether the texture is right.

### Phase 6 — Latte Art Coaching
Record the pour of steamed milk into the espresso. CV analysis of pour technique and resulting pattern, with feedback aimed at helping someone improve their latte art over time.

### Phase 7 — Hardware Integration (stretch)
If grinder/machine has a Bluetooth or app API, close the loop: the system doesn't just recommend a grind adjustment, it sets it.

---

## Open Questions (Not Yet Decided)
- **Tech stack** — deliberately deferred until this spec is locked
- **"Done" criteria for MVP** — needs a concrete, testable definition
- **Video storage approach** — where pour videos live and how they're linked to shot records, even before any analysis is built
