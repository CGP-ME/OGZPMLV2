# STOP 1 J2 cold-pull review

Review the exact change from base `8fa8d2b472a7ed63d1e3910c5930b8bb79ecc33f`.

1. Does publication of the established singleton path have one exclusive winner without rename replacement?
2. Can simultaneous stale-owner contenders both delete or report ownership?
3. Is a complete owner record visible before acquisition success is returned?
4. Can a non-owner release the winner's record?
5. Are candidate/owner-lock artifacts removed after completed paths, while the stable reclaim-mutex inode remains non-authoritative and reusable?
6. Are unreadable or changed ownership records preserved rather than guessed away?
7. Are the existing backtest skip inputs and production lock basename unchanged?
8. Did J2 avoid changing signal/fatal handlers, shutdown ownership, configuration ownership, readiness, or trading behavior?
9. Does the committed direct probe reproduce on the cold-pull filesystem without starting the bot or using Jest/network services?
10. Can any operative startup/setup path still delete the established singleton owner record outside `SingletonLock`?
11. Does the probe establish readiness before contention and keep the winner alive until every losing outcome is observed?

Do not treat the child-process receipt as deployed runtime acceptance. J3 still owns the actual operator shutdown and single release lifecycle; PM2 activation remains unapproved.
