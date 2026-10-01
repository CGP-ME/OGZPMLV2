# Exact-source behavior reproduction

The two fixture files under fixtures/ are byte-identical copies of those executed. From repository root, set MA_REVIEW_TREE=d574b566eb8d3a869c9490af5723b90724b191ba and MA_CAP_EXPECT_CORRECTED=1, unset MA_CAP_CORRECTION, then run each copied .cjs fixture. They read immutable Git sources; they do not overlay patches in this mode. Generated scratch/config/output stays relative to the fixture directory. Node child Git execution requires the normal trusted host permissions.

Complete actual observations and source hashes accompany these copies. No broker or PM2 activation occurred.
