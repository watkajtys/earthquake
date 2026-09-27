# Earthquake visualization accuracy review — 2026-09-26

Corrections to the earthquake detail views and regional fault map, prepared for the guarded production release. This change does not modify source data, database schema, or ingestion behavior.

| Area | Verified problem | Correction |
| --- | --- | --- |
| Fault motion | Strike-slip arrows crossed the fault; dip was ignored; vertical motion appeared in a labeled top view. Missing rake invented left-lateral slip. | Continuous strike/dip/rake vectors, a north-up horizontal projection, and a separate true-dip cross-section. Arrows describe one side relative to the other. Missing values suppress motion. |
| Parameter diagrams | Strike was 90° off; north arrow pointed down; dip was fixed; rake started from an arbitrary vector. | Correct compass orientation, right-hand dip direction, actual dip angle, and rake measured from strike toward up-dip. |
| Beachball | Rake-category templates ignored dip and lateral polarity. Selecting NP2 mixed its rake with NP1's strike. | Double-couple radiation computed from all three angles, with lower-hemisphere equal-area projection and correctly projected nodal curves. Plane selection cannot change the mechanism. Removed obsolete template helper/tests. |
| P/T axes | Fixed horizontal/vertical arrows ignored azimuth/plunge and implied measured regional stress. | Actual projected axis orientations, numerical azimuth/plunge, and source-axis explanation. Partial axes are not plotted. |
| Product data | Only moment-tensor products were read; malformed numeric strings were partially accepted. | Coherent selection of a complete moment-tensor or focal-mechanism solution, NP2-only fallback, strict angle validation, and event-scoped plane selection. Explicit selection of incomplete alternatives shows available parameters without invented slip. |
| Regional faults | Many slip categories fell through to white; lateral sense lacked a viewpoint; slip-rate tuples lacked units. | Category colors and legend, observer-relative movement descriptions, labeled mm/year rates, and explicit distinction between nearby traces and the ruptured fault. |
| Energy/magnitude | Scalar moment in N·m was labeled radiated energy in joules; all magnitude types were described as Mww. | Separate moment and approximate magnitude-derived radiated energy; accurate Mw/Mww wording. |
| Snapshot time | The row claimed UTC while the displayed timestamp included the viewer's local timezone. | Removed the incorrect UTC qualifier; the timestamp retains its explicit timezone. |

## Conventions and limits

Strike is clockwise from north, with dip to the right of strike. Rake 0° is left-lateral, ±180° right-lateral, +90° up-dip/reverse, and −90° down-dip/normal. [ObsPy convention and reference](https://docs.obspy.org/packages/autogen/obspy.imaging.beachball.beach.html).

The focal mechanism admits two alternative nodal planes; additional evidence is needed to identify the ruptured plane. Neither the schematic nor a nearby map trace establishes an event-to-fault association. [USGS explanation](https://www.usgs.gov/programs/earthquake-hazards/focal-mechanisms-or-beachballs).

The beachball displays the double-couple representation of the reported nodal-plane parameters, not the full non-double-couple moment tensor. Shading samples the analytic radiation field at 240×240, while the nodal curves use continuous sampled spherical projections. Labels state the projection and polarity convention. P/T source axes are not direct regional stress measurements. [USGS ComCat](https://earthquake.usgs.gov/data/comcat/).

Energy uses the approximate relation log10(E/J) = 1.5M + 4.8 and is labeled as an estimate; actual radiated energy varies between events and magnitude scales. [USGS energy reference](https://pubs.usgs.gov/of/1998/ofr-98-0767/). Fault rate tuple semantics follow the [GEM source schema](https://github.com/GEMScienceTools/gem-global-active-faults#data-types).

## Validation

- 172 tests passed across 20 relevant suites, including canonical fault types, oblique geometry, projection boundaries, equivalent nodal planes, missing inputs, focal-only events, event selection, energy separation, and map popup semantics.
- Independent comparison of the NED tensor against [ObsPy's explicit equations](https://raw.githubusercontent.com/obspy/obspy/master/obspy/imaging/scripts/mopad.py) across 5,824 mechanisms agreed to floating-point precision.
- Browser inspection of the actual React panels confirmed normal/reverse arrows, strike-slip direction, parameter diagrams, beachball polarity, P/T projection, and unchanged beachball when toggling alternatives.
- ESLint passed on all 26 changed/new JavaScript files; `git diff --check` passed; production build passed. Existing large-bundle and stale Browserslist notices remain outside this science review.

This is a focused review of source/fault communication, not a certification of every chart or upstream earthquake solution.

## Interactive additions — 2026-09-26

### 3D fault block

The fault panel now renders two closed rock volumes cut by the actual selected nodal plane. Strike, dip, and rake use the same vector convention as the audited planar diagrams. The two sides translate symmetrically along the relative-slip vector, keeping their shared plane coincident. A fence reveals the offset; exposed fault faces are purple. View controls include dragging, azimuth/elevation sliders, a north-up top view, and a view along strike. Slip supports scrubbing, playback, and reset. The existing horizontal/vertical component diagrams remain available in a disclosure.

The labels distinguish hanging wall/footwall from the sides of a vertical fault. Dimensions, displacement, and playback timing are explicitly illustrative. This does not estimate measured slip, reconstruct a surface rupture, or select the actual ruptured plane. Face ordering and fence/label occlusion are tested against independent depth intersections, including shallow, vertical, and oblique mechanisms.

### Final scope and verification

The cluster depth-slice feature was removed at the user's request. Cluster details retain their original map, sequence chart, and event list. The release retains the 3D fault block and the scientific corrections above.

The 3D geometry tests cover volumes, canonical/oblique slip vectors, camera handedness, and occlusion. UI tests cover keyboard controls, slip scrubbing/playback, and reduced motion. Actual React views were inspected at desktop and 390px widths, including normal-fault motion and north-up right-lateral offset. Mobile slip controls use a full-width slider.

The full-app walkthrough used read-only production data through a local Vite proxy. Event `us7000tiqc` displayed both reported nodal planes correctly: switching to NP2 updated the block and parameter diagrams while preserving the beachball. Keyboard slip controls reached 100% and showed the expected normal-fault offset. The Tadine cluster retained its sequence chart and event list after the slice was removed. Events without mechanism data in the cached detail response omit the mechanism panels; this change does not invent parameters or refresh the existing detail archive.

All 31 changed/new JavaScript files pass ESLint, the final detail-view suite passes all nine tests, and `git diff --check` passes. The standard full-suite run before removing the slice passed 1,885 tests across 148 files, with three existing skips and default timeouts. The guarded release will rerun the full checks for the final committed scope. Existing unrelated repository-wide lint errors remain separate.
