# RocketTheft
Tools for analysing and analysis of the performance of Rocket Pool validators in collecting priority
fees and MEV, and detecting MEV theft. Built for the Rocket Pool GMC's
[Bounty BA032304](https://dao.rocketpool.net/t/july-2023-gmc-call-for-bounty-applications-deadline-is-july-15th/1936/6).

## Analysis
We'll start high level and then go deeper.

This first draft is looking at ~19 weeks of data.

### Global vs RP sanity check
| ![image](./results/global_vs_rp.png)   | ![image](./results/global_vs_rp_loglog.png) |
|:--------------------------------------:|:-------------------------------------------:|

The plot above shows a survival function for bids on all blocks and just RP blocks. This is mostly a
sanity check looking at if RP is being consistently lucky or unlucky, and we see no evidence that we
get better or worse bids. The curves move alongside each other well until data becomes too sparse to
be relied on, which is what we'd expect -- no evidence for different "luck" between RP and non-RP.

### Is there systematic theft?
| ![image](./results/rp_mevgood_vs_mevbad.png)      | ![image](./results/rp_mevgood_vs_mevbad_loglog.png)      |
|---------------------------------------------------|----------------------------------------------------------|
| ![image](./results/rp_mevgood_vs_vanillagood.png) | ![image](./results/rp_mevgood_vs_vanillagood_loglog.png) |
| ![image](./results/rp_mevgood_vs_vanillabad.png)  | ![image](./results/rp_mevgood_vs_vanillabad_loglog.png)  |

> **Reading these survival function plots**  
> For a point on the line, we can read it as "what is the probability (see y-axis) that we get a
> Bid of at least _this much_ (see x-axis)"? The theft hypothesis is that high value blocks would be
> over-represented (higher probability) for the lines other than "RP - MEV boost" (because thieves
> would opportunistically target valuable blocks).

The plots above are likely the most important item in this analysis. They show whether we routinely
see high bids on slots where either the recipient is wrong, vanilla blocks are used, or both. If we
see these issues, especially for lottery blocks, that would be significant evidence of theft.

Evidence for this would look like an orange line being to the upper right of the blue line. Even
more telling would be if this excursion only happened for blocks with high bids. We do not see any
such evidence.

- First row:
  - 🚩 The line looks weird. The wrong recipient line is to the upper right of the blue line for the
    0.1-0.4 ETH region. This is about 7 cases, so fairly sparse and potentially possible due to
    chance. It's also not "worth" stealing as a penalty should be applied and will make this size
    theft a net loss.
  - Overall, incorrect fee recipients using MEV boost are super rare; they follow the reference
    well for most of the curve and have no real lotto blocks to date
- Second row: if anything, it looks like RP blocks occur in slots with lower max bids. One theory to
  explain this would be that folks likely to use vanilla blocks don't use many relays, which means
  they get smaller max-bids on average. Another theory is that we don't see the lines diverge until
  we're starting to get sparser, so it may simply be happenstance.
- Third row: these match as well as plausible.

It's important to recognize a couple of limitations. First, the sample size for large blocks is very
small (especially not using MEV boost). Second, if an NO hasn't registered with any relays, they
won't get max bids and won't show up on this plot (see next section for an attempt to handle that).


### Is there systematic theft? Take 2
This is just like the above section, with a twist -- if there's no max_bid for a particular slot,
we take the mean max_bid of the 3 slots before/after as a proxy (or the mean of all max_bids in the
rare cases where that doesn't work). This tries to solve the second limitation mentioned above (NO
that never registered), but it comes at the cost of fidelity since we don't have actual data from
that block.

| ![image](./results/take2_rp_mevgood_vs_mevbad.png)      | ![image](./results/take2_rp_mevgood_vs_mevbad_loglog.png)      |
|---------------------------------------------------------|----------------------------------------------------------------|
| ![image](./results/take2_rp_mevgood_vs_vanillagood.png) | ![image](./results/take2_rp_mevgood_vs_vanillagood_loglog.png) |
| ![image](./results/take2_rp_mevgood_vs_vanillabad.png)  | ![image](./results/take2_rp_mevgood_vs_vanillabad_loglog.png)  |

There's no significant difference.

### Current losses

Running `analysis.py` provides some text in addition to making the plots:

```
Analyzing 43.0 weeks of data (2165000 slots)
 95.6% of range; 44.9 weeks (2264999 slots)
 
Filled in proxy max_bids for 22113 slots; 21027 were missingbloxroute max_bids

=== MEV-Boost Recipient losses  (see results/recipient_losses.csv) ===
1: 18 of 48699 MEV-boost slots used wrong fee recipient
3a: 1.328 total ETH lost due to wrong fee recipient
  Top 5 losses: 0.30, 0.23, 0.14, 0.12, 0.09
3b: 0.031 ETH lost per week
3c: APY was 4.411% when it should have been 4.412%
 aka, a 0.01% performance hit

=== Vanilla Recipient losses (see results/vanilla_losses.csv) ===
 830 of 5193 vanilla slots used wrong fee recipient (see results/recipient_losses_vanilla.csv)
~46.945 total ETH lost due to wrong fee recipient
  Top 5 losses: 1.51, 1.30, 0.80, 0.72, 0.67
~1.093 ETH lost per week
 APY was ~4.411% when it should have been 4.422%
 aka, a 0.25% performance hit
NB: We take a stab at vanilla losses using 90% of max_bid or sum of priority_fees, but it's possible for vanilla blocks without max_bid to hide offchain fees

=== Non-recipient vanilla losses (see results/vanilla_losses.csv) ===
There were 4363 vanilla RP blocks w/correct recipient
  3576 had bids; we can get ~loss
  787 had no bid; we'll use nearby bids as a guess
4a: ~188.868 ETH lost due to not using relays (or theft)
  Top 5 losses: 17.23, 5.54, 5.10, 5.07, 3.00
4b: ~4.397 ETH lost per week
4c: APY was 4.411% when it could have been ~4.455%
 aka, a 0.99% performance hit

Sanity checking 2 ways of estimating the unknown loss: 49.705 vs 27.776
 if first method is much higher, that means we're seeing vanilla block more often than expected during periods that tend to have high max bids, which is a yellow flag... do note that outliers can move these a lot with respect to each other
WARNING: 18 slots had no nearby max_bids;filling with mean max_bid

```

Some takeaways:
- 🚩 There are much too many vanilla blocks with wrong recipient - around 16% of vanilla blocks!
  - These haven't been a huge loss (0.1% performance), but this loss can appropriately be penalized
- Vanilla blocks in general have been a significant loss (0.99% degradation in performance)
  - Note that ~9% of that is a single block

### Vanilla blocks: RP vs nonRP sanity check
| ![image](./results/vanilla_rp_vs_nonrp.png) | ![image](./results/vanilla_rp_vs_nonrp_loglog.png) |
|:-------------------------------------------:|:--------------------------------------------------:|

The plot above shows a survival function for bids on RP vanilla blocks vs non-RP vanilla blocks.
Ideally we'd expect the same curves to be followed. They mostly are, and we can guess that the
slightly lower RP values are due to vanilla RP users having fewer relays registered which leads to
lower max bids.

### Conclusions
- 🚩❓ Something is potentially weird about the bad recipient MEV boost data.
  - It doesn't appear like it would be profitable in the face of penalties
  - We should assign penalties
- 🚩 There are much too many vanilla blocks with wrong recipient - around 16% of vanilla blocks!
  - We should assign penalties
  - We should consider other mitigation (eg, disallow vanilla blocks entirely)
- Losses are a small, but not totally negligible, decrease in performance
  - MEV bad recipient: 0.01%
  - Vanilla bad recipient: 0.25%
  - Vanilla correct recipient: 0.99%
  - This adds up to 1.25%. To put that in perspective: as of 2023-09-04, this is equivalent drag to
    7.1k idle ETH (eg, in the deposit pool)
    

### For reference: goals per the bounty

```
Detail level
1) For each MEV-boost block, check if an acceptable fee recipient was used
2) For each vanilla block, calculate how much was lost by not using MEV-boost

High level
3) Losses due to wrong fee recipient
  3a) Total ETH
  3b) ETH per period
  3c) Effect on APR
4) Losses due to not using MEV-boost
  4a) Total ETH
  4b) ETH per period
  4c) Effect on APR
5) Distribution of MEV-boost bids for
  5a) All block
  5b) All RP blocks
  5c) :star: All RP blocks that use MEV-boost w/correct fee recipient
  5d) :star: All RP blocks that use MEV-boost w/wrong fee recipient
  5e) :star: All vanilla RP blocks
```

