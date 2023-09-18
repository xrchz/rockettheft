# RocketTheft
Tools for analysing and analysis of the performance of Rocket Pool validators in collecting priority
fees and MEV, and detecting MEV theft. Built for the Rocket Pool GMC's
[Bounty BA032304](https://dao.rocketpool.net/t/july-2023-gmc-call-for-bounty-applications-deadline-is-july-15th/1936/6).

## Analysis
We'll start high level and then go specific.
We analyze 40.7 weeks of data, starting right after the MEV grace period ended at slot 5203679
(2022-11-24 05:35:39Z UTC); see
https://discord.com/channels/405159462932971535/405163979141545995/1044108182513012796.

### Global vs RP consistency check
| ![image](./results/global_vs_rp.png)   | ![image](./results/global_vs_rp_loglog.png) |
|:--------------------------------------:|:-------------------------------------------:|

The plot above shows a survival function for bids on all blocks and just RP blocks. This is looking
at if RP is being consistently lucky or unlucky, and we see no evidence that we get better or worse
bids. The curves move alongside each other well until data becomes too sparse to be relied on, which
is what we'd expect -- no evidence for different "luck" between RP and non-RP.

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
routinely see these issues for lottery blocks, that would be significant evidence of theft.

Evidence for this would look like an orange line being to the upper right of the blue line. Even
more telling would be if this excursion only happened for blocks with high bids. We do not see any
such evidence.

- First row:
  - Overall, incorrect fee recipients using MEV boost are super rare; they follow the reference
    well for most of the curve and have no real lotto blocks to date.
  - 🤔 The line looks a little weird. The wrong recipient line is to the upper right of the blue
    line for the 0.2-0.4 ETH region. This is only a handful of cases, so fairly sparse and
    likely due to chance. It's also not "worth" stealing as a penalty should be applied and will
    make this size theft a net loss.
- Second row: if anything, it looks like vanilla blocks are underrepresented in slots with high max
  bids. A theory is that since we're defining anything beyond RP-approved relays as "vanilla", then
  non-RP validators (some using other relays) should expect to have higher rewards on average than
  RP validators using no relay. Another theory to explain this would be that folks likely to use
  vanilla blocks (because no block is provided on time) don't use many relays, which means they get
  smaller max-bids on average. It's likely a mix of those effects.
- Third row: these match as well as plausible for the amount of data.

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

### Vanilla blocks: RP vs non-RP consistency check
| ![image](./results/vanilla_rp_vs_nonrp.png) | ![image](./results/vanilla_rp_vs_nonrp_loglog.png) |
|:-------------------------------------------:|:--------------------------------------------------:|

The plot above shows a survival function for bids on RP vanilla blocks vs non-RP vanilla blocks.
Ideally we'd expect the same curves to be followed. They mostly are. As previously noted, non-RP
"vanilla" includes some non-RP-approved relays and is thus likely to be slightly better. Within RP
vanilla, wrong fee recipient cases _might_ have slightly lower max bids? Hard to say given the low
amount of data we're looking at for the part that diverges.


### Current losses

Running `analysis.py` provides some text in addition to making the plots:

```
Analyzing 42.0 weeks of data (2116321 slots)
 100.0% of range; 42.0 weeks (2116321 slots)

bid2reward: mean=0.906 median=0.952

Filled in proxy max_bids for 19363 slots; 18280 were missingbloxroute max_bids

=== Removed slots ===
These slots are removed b/c we can't tell if they used an allowed relay or not
  due to miscategorizing, the fee recipient info in the csvs should be ignored
beaconcha.in relay tags for RP vanilla slots: Counter({None: 3975, 'bloxroute-ethical-relay': 529,
'agnostic-relay': 339, 'relayooor-relay': 27, 'aestus-relay': 10, 'manifold-relay': 5})
Wrong fee recipient losses in these blocks about to be dropped: 0.14ETH

=== MEV-Boost Recipient losses  (see results/recipient_losses.csv) ===
1: 17 of 48880 MEV-boost slots used wrong fee recipient
3a: 2.110 total ETH lost due to wrong fee recipient
  Top 5 losses: 1.07, 0.23, 0.15, 0.14, 0.12
3b: 0.050 ETH lost per week
3c: APY was 4.266% when it should have been 4.266%
 aka, a 0.01% performance hit

=== Vanilla Recipient losses (see results/vanilla_losses.csv) ===
 187 of 3975 vanilla slots used wrong fee recipient
~8.640 total ETH lost due to wrong fee recipient
  Top 5 losses: 0.80, 0.67, 0.58, 0.44, 0.43
~0.206 ETH lost per week
 APY was ~4.266% when it should have been 4.268%
 aka, a 0.05% performance hit
NB: We take a stab at vanilla losses using 90% of max_bid or sum of priority_fees, but it's possible
for vanilla blocks without max_bid to hide offchain fees

=== Non-recipient vanilla losses (see results/vanilla_losses.csv) ===
There were 3788 vanilla RP blocks w/correct recipient
  3223 had bids; we can get ~loss
  565 had no bid; we'll use nearby bids as a guess
4a: ~159.375 ETH lost due to not using relays (or theft)
  Top 5 losses: 17.23, 5.10, 5.07, 3.00, 2.77
4b: ~3.796 ETH lost per week
4c: APY was 4.266% when it could have been ~4.304%
 aka, a 0.88% performance hit

Comparing 2 ways of estimating the unknown loss: 39.491 vs 19.052
 if first method is much higher, that means we're seeing vanilla block more often than expected
 during periods that tend to have high max bids, which is a yellow flag... do note that outliers can
 move these a lot with respect to each other
```


### Conclusions
- ⚠ There are a significant number of "vanilla" blocks with wrong recipient; ~4.7% of these blocks!
  - We should assign penalties
  - We should consider other mitigation (eg, disallow vanilla blocks entirely)
  - Some of these have a potentially allowed fee-recipient (eg, send to smoothing pool when not in
    smoothing pool). We've asked for clearer spec on this.
  - ~84% of these "wrong recipient" blocks have a payment to the fee recipient (see 💬4 in
    [feedback_20230917.md](./feedback_20230917.md)); these were most likely using a non-RP-allowed
    relay, but could also be caused by an RP-allowed relay with missing data.
- We should assign penalties for bad recipient using MEV boost as well
- Vanilla blocks in general have been a significant loss (0.91% degradation in performance)
  - Note that ~10.8% of that is a single block. This was a vanilla block without any max bids and a
    correct fee recipient. We're approximating the loss by:
    - Taking the mean of the 3 slots before and after, which are 28.02, 8.34, 46.84, 12.88, 45.94,
      and 37.25 ETH respectively
    - Finding the rETH share of that (64.5% here)
    - Adjusting for the priority fees that _were_ paid out
- Losses are a small, but not totally negligible, decrease in performance
  - MEV bad recipient: 0.01%
  - Vanilla bad recipient: 0.05%
  - Vanilla correct recipient: 0.88%
  - This adds up to 0.94%
    - To put that in perspective: as of 2023-09-05, this is equivalent drag to
      4.5k idle ETH (eg, in the deposit pool)

## Data notes
- We start analyzing at slot 5203679, which is after the grace period per
  https://discord.com/channels/405159462932971535/405163979141545995/1044108182513012796
- "Vanilla" in this analysis
  - Getting "vanilla" vs not would actually require (a) querying _all_ relays that exist, (b) having
    every relay that exists publish/store well so the querying is effective, and (c) no collusion.
    In other words, it would require trusting all relays and querying all relays.
  - Instead, we are using "used and RP-allowed relay" as our `MEV boost` category and "didn't use an
    RP-allowed relay" as our `vanilla` category.
    - On average, this should result in a small advantage to non-RP proposers, as they might have
      non-RP-allowed relays boosting their rewards but still show up as "vanilla".
- Further complication to "Vanilla"
  - Unfortunately, the "bloXroute ethical" API has been sunset, so we weren't able to use that
    properly. As a workaround RP vanilla blocks are checked to see if they had relay rewards
    according to beaconcha.in. If so, they are simply dropped from the dataset to avoid polluting
    our `vanilla` category with known MEV. Note that if multiple relays provide the same block,
    there's no way to tell which relays were actually used. In other words, if someone had a
    non-RP-allowed relay on, we're removing it from the list here.
    - This means "vanilla" for RP is very close to meaning "vanilla", but "vanilla" for non-RP means
      not MEV-boosted by an RP-allowed relay
    - This enhances the advantage mentioned above for non-RP proposers
    - `correct_fee_recipient` shouldn't be trusted for these slots; because they were initially
      categorized as vanilla, we look for the fee recipient instead of a separate MEV reward
      recipient, which doesn't work in the cases where a relay _was_ used
    - This is, unfortunately, a pretty large set of the "vanilla" blocks - about 19% of them
- Proxy max bids are used when needed
  - If a validator isn't registered with any MEV relays for a slot, it won't have a `max_bid`
    - We get the mean of the `max_bid`s from the 3 slots before and after the slot
    - If all of those are missing, we use a global average
  - If a validator has an `mev_reward` but no `max_bid`
    - We used an empirical average multiplicative scalar between `max_bid` and `mev_reward` to
      estimate `max_bid` from `mev_reward`
    - We only saw this with some slots where bloXroute was the `mev_reward_relay`
- Data artifacts
  - There were 13 slots that reported one or more `mev_reward`s from a bloXroute relay _and_ an
    `mev_reward` from another relay with mismatching reward sizes. The bloXroute mev_rewards were
    deleted in favor of the other relays based on beaconcha.in as a second opinion. The number of
    slots makes this negligible regardless. This applies to slots 6209620, 6209628, 6209637,
    6209654, 6209657, 6209661, 6209675, 6209814, 6209827, 6209867, 6209871, 6209957 and 6209964.
  - There is an ambiguous period for ~3 days after a solo migration is initiated depending on
    whether the validator gets scrubbed. This was simply neglected. Back of the envelope math showed
    there were ~8 or so likely proposals in these periods.
  - There were 5 slots with over 20% `avg_fee` which is impossible. This is due to an RP bug that
    used overall minipool index instead of minipool index within a node. When someone initialized
    their fee distributor with a prelaunch pool, it would still add to commission b/c it grabbed
    from the overall index. There are also plenty of versions of this issue that result in incorrect
    but not obviously impossible `avg_fee`. This issue was hotfixed at slot 5104754; since this is
    prior to the end the MEV grace period, it doesn't directly affect this analysis, but may affect
    extensions to it.
- The largest MEV-boost recipient loss is from slot 6376024; this was due to a configuration error
  after a solo migration and the Node Operator immediately sent the correct amount to the
  smoothing pool (see
  https://etherscan.io/tx/0x18a28f9bba987a05bc87515faa6490cef3fe61b02dc45d68cffcf3a4e6f791a0)

## RP issue counts by node address
This section is included for 2 main uses.
The first is looking at the large contributors so we can take action (reach out, penalize, etc).
The second is so that NOs can easily search themselves.
Note that the 🚩 lists are certain issues, whereas the ⚠ lists are potentially ok.

```
🚩Wrong recipient used with MEV-boost: Counter({'0x1A7d31ceC3EDF4b1CA4641fD66FB54f2ff5e64cA': 5, 
'0x8B2Efc253ece18e2d51d68771a085C14DDa26a5a': 4, '0x45beA5Da5d62FB0C9E761f330E244C9C1553EB78': 2, 
'0x24a9db8f232948c2f64A4BBD68AC52A2694efa9F': 2, '0x1De3626d6fc2d7c14AF8020B5E8A0c3371D9195D': 1, 
'0xAAF39a9D51B27d8160FBBE24999Cc501caFa8754': 1, '0xB498446d6B701407fed1F34a1A7328df3Aa32308': 1, 
'0x5AED3d3382993e893491D8085f2AAB00Fc8A55ae': 1})
🚩Wrong recipient used with vanilla: Counter({'0x7C5d0950584F961f5c1054c88a71B01207Bf9CB7': 11, 
'0x17Fa597cEc16Ab63A7ca00Fb351eb4B29Ffa6f46': 8, '0x895F6558f0b02F95F48EF0d580eC885056dcCCC6': 7, 
'0x5945459c5201e21Ff409C9608600D0c0d5f91635': 6, '0xacB7CFB56D6835d9E2Fa3E3F273A0450468082D9': 6, 
'0x663CbbD93B5eE095AC8386C2a301EB1C47D73aA9': 5, '0x22FFBA127F6741a619fa145516EF4D94B90f093A': 5, 
'0xc5DbFAf13F8B0BaC6DEF344FbbCFef06aC84eef9': 5, '0x9A8dc6dcD9fDC7efAdbED3803bf3Cd208C91d7C1': 4, 
'0xD91EEcc267ff626399798040d88DE62c9e70Acf0': 4, '0x47179647c0671567625fECd7F6c107A74Cf3E788': 3, 
'0xEA19342eaCC5001722C7864B1a4C50BBb8F94df0': 3, '0xD93aeF2867144297802B41E7887C5C0d5b853fED': 3, 
'0x52e5F0A3fD38a9D73f313Fd0973971b908688649': 3, '0xd714338098Daaf32e46a20fF1293f57EFf04Dcca': 3, 
'0x24a9db8f232948c2f64A4BBD68AC52A2694efa9F': 3, '0x1De3626d6fc2d7c14AF8020B5E8A0c3371D9195D': 3, 
'0x9Ae36ABEcC2604083FA61F107E7B2fb0920D3603': 2, '0x78072BA5f77d01B3f5B1098df73176933da02A7A': 2, 
'0x84ba027280cC6cc1e592a01270c5f21A494F46Cb': 2, '0x68d3081e20321c2386d038B688b045093f647e87': 2, 
'0xaE6085F13A114689e92A4b220025ff2cc9EbBf6D': 2, '0x63A0Cb39ddFf858F608B4708FDC72Be83Ab40b5E': 2, 
'0xB221399c52686E32F93b5dab6c4C7D3c8B1BBe11': 2, '0xFbEd2f322c918363F6E663E00e923574027C5231': 2, 
'0xd599981EA55319eF7AA856934104536A4DbeB9a9': 2, '0x5555CFde0932C1f8Eff8B1F33BE4C1AAbeDf5D78': 2, 
'0x5AED3d3382993e893491D8085f2AAB00Fc8A55ae': 2, '0x8630eE161EF00dE8E70F19Bf5fE5a06046898990': 1, 
'0x5d8172792a9e649053c07366E3a7C24a37F0C534': 1, '0x8bf04aF186A7Ac0078f32467e4A8cC57D8CA848d': 1, 
'0x8dEA24025cF3080FE46af8511c1Be871302B2d63': 1, '0xc0E7C12756954454937943316B2Ad99e4eBE11aC': 1, 
'0x7Af638C962f7c427Cfd1ec42C1E32f1c618aacc2': 1, '0x521140587FA4A85a5c231C3bB10ad430673b7eFF': 1, 
'0xF6fd4eC926d83AdaDd725E67D4005763832f4679': 1, '0xe3a0FEC479C9D8F3A01446A1b0414944d47D7550': 1, 
'0x2C1ec76e2fB8B8f070b4687C122e8dee0EC79A63': 1, '0xfD3D8DeA632a6f69dff460BFE351426EA190e6A7': 1, 
'0xD000AFcF644D5A651D53BA8cF3E49bCc2AC0f303': 1, '0xF3d688E983859e63B7A9aFf400a8E1293665e2f5': 1, 
'0x8Ed9e1f3b9332a12E9625fE971Aed0C9a4E2a99D': 1, '0x53Cad1487424A6e386F7791863b61802100Fa091': 1, 
'0x6327DA5284187fe63952DCd954C0b8Df1F478f3c': 1, '0x0f28f81dA622fDDF01E728F524c24011E5DcFFE7': 1, 
'0x9C9E7e6EF247D80CE6e4dEd2a9911B4746543E28': 1, '0x3E1E0f284C49090a4F95e2444f77687a06E7Ba80': 1, 
'0xB4E70e24EC3546Fee830213D969d855b99fDD112': 1, '0x4680B01D48f107928Dc75C3Ae5C8296D8cB0b5f7': 1, 
'0x5008724186728Bbd5CDddafb00C08B83Be57961B': 1, '0x2B0E4276063Ea28a74a6731736e4531a04d31d31': 1, 
'0x835158b0C68437239f520aE9304aF071F72D2Bb9': 1, '0x16a2b3134A136ec9E317dc6Fecae0666F08452F6': 1, 
'0x8438F39b5f455a4bEaa3276Bd19201A994aE0942': 1, '0xf37e7b491ba3347639CfFf8A136EB72D93D02504': 1, 
'0xFA7ae9d9fF19d042Ee9d969677ce34472b148861': 1, '0x0aa21643F1F677bda24e35EA5C8B53cc3ef2E7f6': 1, 
'0xD5418D3289321A68BC70184D1A5240F5154F5C07': 1, '0xD436434F36be32E7E5ea4035c3B91a725A68887c': 1, 
'0x7beD6DdfC0279A19C24Ad025c37b7933418ee766': 1, '0x53236cD988bE5e71ee8e269Cd4F9f4dd4CA37c45': 1, 
'0x9Cab29b34d1606e869535fEA17a6Be56EB4e8006': 1, '0xDf36999a33B1A9d5ED6F34a363bD14E58D4605ce': 1, 
'0xb8ed9ea221bf33d37360A76DDD52bA7b1E66AA5C': 1, '0x2d2BfE2389B7b3779fa04d101f75a89F6A62DcD6': 1, 
'0x6946d60fa94039b08332fe24E5927b047678AC79': 1, '0x9821Af37B0654d992d682892169Ca856f12FC37E': 1, 
'0xd0B79F6d72Bf780c3D00756Bad30331e84784D87': 1, '0xba8C36c0E202F7a9EA0189C3899C8D18123562eB': 1, 
'0x9b864a921b4BF45725aeB00C083B956C7467e67d': 1, '0x3Fe0fbaA0BfC6f560cE65d55882cBb12b9Cba21e': 1, 
'0xA7ab5E5DE44e44A281A7Aa0161b84f10eD91E833': 1, '0xf17E433c906e4E0B6F485B2473BaB4935F9cBC3a': 1, 
'0xb15874BDCBa04d873cBf79bD8F12606e9A5Ca079': 1, '0xf3813cD7b630b1488e68bA22a145d8C53ec17CbB': 1, 
'0xa5C142E01153b28f5DA63Cd8C118F59765175Bd8': 1, '0x09C2B03c683C058712Ff5E95c0c4BFeAe083db6d': 1, 
'0x1F691C24D104B6993F03EB3C36d2Cc95EAa42063': 1, '0x4ec5FA6a4FfF7Ec823B45dB6d57f2716833e8147': 1, 
'0x327260c50634136551bfE4e4eB082281555AAfAE': 1, '0xf6CD08800f9f571c17DE46D77C1911Cc9b1f3aCf': 1, 
'0x757e12C23934F5Df3d165874f97ABF57aB0a9479': 1, '0xDCf6714a2e218Df5B4164aD4d8c5f35D01D9acc4': 1, 
'0x8a1Ba5aB6c934B2D6f317451000EE0632507e377': 1, '0xf9A9ddDB41440c0eBcF9BF2F0c9818BCD397244F': 1, 
'0x4FCA54bB44AbE853FF884e8b5DE032a2cc058184': 1, '0x36F16155CaC97dc8B4654a6143A8B0d276a4963c': 1, 
'0xB81E87018Ec50d17116310c87b36622807581fa6': 1, '0xc1A95D5F674F809b80D768c12cAd12fbEB5c370c': 1, 
'0xbfaf9BFa09F26EF8104A6d5FF09afdCC9300E5bc': 1, '0x77d04e755AaB7b079a45aB48Ce2dbb30DEF8AeFf': 1, 
'0xca317A4ecCbe0Dd5832dE2A7407e3c03F88b2CdD': 1, '0x9246f1C4f24868E678Fad180a0859392f8A4791d': 1, 
'0x215Ee436724deC41bD4ee9CaCB8900D886E02d08': 1, '0x2999cd1E7fe6C50d63AefA5255809E9B25A96d0f': 1, 
'0x0F986F18A9875F467cB2E2Ab7e1EaA3A70E74079': 1, '0x0f66BaC4f971bfbD7C931de75A8ED753Bb52Dc2F': 1, 
'0xCf41178e0cAE221AC0f9392e5042b5bCf83486d7': 1, '0x8AF2565bE72735484c1114a856B5C96735db1eD6': 1, 
'0x5DEaB7820FD92AC0ac57910847e83d395fF21EEc': 1, '0xa81a518F5E227E4C9f3ffE5E2c6a039fd280b8A2': 1, 
'0x4fBd2F3D84e2A5826dEce41578E31f089048cb60': 1, '0x986b3293c5BaDeC36C6d8c652b0Ba6A82Ef5237b': 1, 
'0xDd677B8375c170201764A5d415861Fb36Da5b5E3': 1, '0x8d6B5AA8755FbD93dd02c1Fbebd7A5C4cB3c7E8C': 1, 
'0xCc00b35a6bb67C54B174058C809Ec838f360Dd88': 1, '0xae9B9265e685C5eA54aBa272CA648f25D0b5A4C3': 1, 
'0x45beA5Da5d62FB0C9E761f330E244C9C1553EB78': 1, '0x1C2d2C2258c522bece4E027b1088b26c131AC98A': 1, 
'0x5667bCA5ED365Ad1e7836d8558BA8B65CaA6De29': 1, '0x4334CdDDb5c8432fb0a6F4FFe09D96F0A3c74254': 1})
🚩Wrong recipient used in removed blocks (we have no mev data, but beaconcha.in 
does):Counter({'0x4892E52502CFdD675BeE1C26F5E4b76e2Aca84ba': 3})
⚠ Vanilla blocks (with correct recipient): Counter({'0xca317A4ecCbe0Dd5832dE2A7407e3c03F88b2CdD': 674, 
'0xb8ed9ea221bf33d37360A76DDD52bA7b1E66AA5C': 330, '0x17Fa597cEc16Ab63A7ca00Fb351eb4B29Ffa6f46': 132, 
'0xdBC41aEAeA480459386feeC0C575F7ca56e8FfF1': 102, '0x6BBbA538C14D36eE92dd3941Afe52736c5cFb842': 72, 
'0xCC1fC2Fcf6B3B45F76a69E82CCeDb75a2BbD727C': 58, '0xCc00b35a6bb67C54B174058C809Ec838f360Dd88': 56, 
'0x9A8dc6dcD9fDC7efAdbED3803bf3Cd208C91d7C1': 50, '0xc5D291607600044348E5014404cc18394BD1D57d': 42, 
'0x9cc778D26fCd8555Cb188a35Dca8cCF1634d76E9': 41, '0xED8Da4DAF5B1b112fD27123ca414496cf033A3bb': 39, 
'0xcf893845C90Ede75106Bbcd402EFC792F6C5b4BF': 38, '0xB81E87018Ec50d17116310c87b36622807581fa6': 35, 
'0xae72F470Da5446005c756B08D3e916f7EA8E9B72': 22, '0x8d6B5AA8755FbD93dd02c1Fbebd7A5C4cB3c7E8C': 22, 
'0xC36bF13B69BCaEED8Bc73Ac7Cd28fd2Fb084f256': 22, '0x47CF173BcA05e67c54984Cb160D4F8D64046E7e5': 22, 
'0x68d3081e20321c2386d038B688b045093f647e87': 21, '0xC3400D3536a08f4Cd75a5d7120A92ec24d2AaF52': 20, 
'0xCC27D4212D9333Ef941533Ea67bFef66f38Bf0d8': 17, '0x5d8172792a9e649053c07366E3a7C24a37F0C534': 16, 
'0x2b6fCa9AD7EBd5408dB009f0DF087Ffd934cF98e': 15, '0xc1A95D5F674F809b80D768c12cAd12fbEB5c370c': 15, 
'0x8e827814d5d86bE1dc648A2E5fe9ab4872046aBD': 14, '0xb89dc2A12dcCC64FF60072fBE1786fA68B5450DB': 14, 
'0xed40002F46D76224e44E314a19b2e053e55c4E17': 14, '0x5D55f5453619d9DF806f9a9Cb2986A919B4882D1': 13, 
'0xA52533b32394EfBf7B6f75BAEa069e3e6a636a49': 13, '0x1De3626d6fc2d7c14AF8020B5E8A0c3371D9195D': 13, 
'0xF6b216dd90873d07e45635AfBBCd1B46A490dd7b': 13, '0x78072BA5f77d01B3f5B1098df73176933da02A7A': 13, 
'0xA9c8550BffD4bD11c09da4a807dCC3B87C71B481': 12, '0x1A2211addeD399a5bFBf09442Dc59a0A4cb296Ae': 12, 
'0x24D2706C07ff041DB342Bd72343Fd79E06129802': 12, '0x701F4dcEAD1049FA01F321d49F6dca525cF4A5A5': 12, 
'0xD93aeF2867144297802B41E7887C5C0d5b853fED': 12, '0xd714338098Daaf32e46a20fF1293f57EFf04Dcca': 12, 
'0x53829Cc7E582F5D9945d1bfC0e2Ed8B271202592': 11, '0x207417bB9cab68286534543a1ABD697d25F71877': 11, 
'0xC6c06A3FF87e3cF1030a0C4A98F2108EF2ee5Dd9': 11, '0xd13e849134425cDEE7dd46e594c676d16470f837': 11, 
'0xDB21B164A38a5eF18bA33E6A61BA192B3649f879': 11, '0xaCfAd9f0D80F74aD7E280A55eA025f4f09844B0F': 11, 
'0x2F8ef05D6AAAe98Af0D10Ef4Cec24750fb819Ce2': 11, '0x4cad3c72216CC21d6Fa9e84f1a1821dF25613C03': 10, 
'0x949953B4aB9748992f3B9841E2f510d502Ec2C8E': 10, '0x101B8fDa175d0d3A3B4aD15418fC068c1c3866f8': 10, 
'0x1996aD1B5602E025966d44af0b239915aAe17a90': 10, '0x4CeCc37345ce702fA6285Ab9098dA34654Ee0471': 10, 
'0x6cDc3EaFcfa672A7d8cB85F7365E952e83765b5d': 10, '0x22FFBA127F6741a619fa145516EF4D94B90f093A': 10, 
'0x03d2634F6b03B24F835bE14F8807B58E6acD14cB': 10, '0xEda174818b4Ef8E3749b5e5235141fe370F4821b': 10, 
'0xb9378C998c46cb50444B004F022CBf92fBcd38EB': 10, '0x83Ad4742D56690DCd62b32EC3baaDE0A5A7FFC7d': 10, 
'0x4b1F8f33dc62f1be7Ea54A24a0DF37C15E37D662': 9, '0xce4C4b6474C26C60e7c84C77887820ab9EAbb205': 9, 
'0x5Bd353C49fe776b9Bd0661c1D86ADe344d88D416': 9, '0xc2E11bA3A515240Fc4D0f4a86B8BB79dF26f9F8c': 9, 
'0x895F6558f0b02F95F48EF0d580eC885056dcCCC6': 9, '0xD91EEcc267ff626399798040d88DE62c9e70Acf0': 9, 
'0x5008724186728Bbd5CDddafb00C08B83Be57961B': 9, '0x9b864a921b4BF45725aeB00C083B956C7467e67d': 9, 
'0xD02e4cA21CcdD67fbB9dD0881414F20dB499cA11': 9, '0x3de156eC417e5931006678Ba7563615B67F45275': 9, 
'0xb23bEFd65079Ec201a486CA6e4425DE4ea296A91': 9, '0x4CdE259C77fCE161d6a6250371a3e56f83887dB0': 9, 
'0x819436b9a197D37FC756bff842401B4d6C2AdAFF': 9, '0x78a47e8041f0F34b52dDfD55ed0d4Fc8c0435995': 9, 
'0x63489804F667aA6581eEc93F9917DFa75030f087': 9, '0x51C0fcdEDC476f6743AD0f8188c88030738beAD2': 8, 
'0xd9D3106bfa3f242BbCa1416D1Ccd95fE109c3CF8': 8, '0xf73a31f573B31045653bBC4D3186709C63537778': 8, 
'0x547E07494EC48dD3A968964E70696D79ccA9eb97': 8, '0x790c60D199c9395DfFB605E39a357c4da4ba9DEb': 7, 
'0x72eD84c5232a8e0bF88aFF101dd9C3fE30fB1AF1': 7, '0x88EC8ac484C14D0b642Ea262ef58af058e7939b6': 7, 
'0xf94860Ea703aeBc00de50F3433Dd2F9306c72CA3': 7, '0x5e624FAEDc7AA381b574c3C2fF1731677Dd2ee1d': 7, 
'0x9060Cc7200BD2Aa6f7a68E8D5CC57BCc12B93853': 7, '0xaD2Bf569034A0006ac13A5Cfb3BB56320FA87D4E': 7, 
'0xA4aBb5182a02cC90FddD590C2b94f263225617a5': 7, '0x8Ad150eeE60Dd2519Bb2713cCec770B0fe07a1ae': 7, 
'0x315621eC6341b4181Cba6e31844D0dcaaF628463': 7, '0x33aCc09E0faaA257E8a4C706dCAEc5CeefAC4329': 7, 
'0x42B7001cc7FF472f1bd871876cc485b8d12975A8': 7, '0x50224da81a32B03DB7E49929308D3B43Fc991CFC': 7, 
'0x0ccdDA6523B8BCAE8B3Ab407623EE073495C5ee0': 7, '0x45E7576cC3E6d45f64a3906835A0bB5c4497e03E': 7, 
'0xA890a63c6Ba7DB5170721f448D3B46c96f817a26': 7, '0x126a5D4624cb6ccDdfd0694Ee4d74c9522f6E3cD': 7, 
'0xe39d21C97B5AA55C9c11A968a76bd3B7bEc552e2': 7, '0xD0801241cf78db13EfEeC55Ca977f78AAA3Fc260': 7, 
'0xd20e9C66264Ae040e89C90af0C74bED97fD0BC65': 6, '0x6CE82a2FEB8baB345D14f7a955d2daaE4fF9d83F': 6, 
'0xf6A8b79d0489F77F95f0abFd671885AE364ec88d': 6, '0x42E36a7B30Aa8eA8bEC7B64170e40aeF20B00Bee': 6, 
'0x3DAc9a314BfA24EE72E4C0b6f7556Aec3612ca73': 6, '0x771F10aB03ACE0EfB3D7BB0bf5bCb93c6f1000eD': 6, 
'0x8D5fD77c79aE6b61002801097bBDdE3300420576': 6, '0xbdf0ff1E1D42526361ffc2348Ee71c5Ca69BaeA9': 6, 
'0x4FAefA6c1ee5ABeaB54E9cF71f7913697627755D': 6, '0x61051221Dd39E2Da825A091bF787F22B753cF5dd': 6, 
'0xAE8E389E2940D937f50De697f350DD86f8AEE93b': 6, '0xF3a88FAE6Ffe731015FB53fB2fa193c9177f87E3': 6, 
'0xDdCcE65862fb2bD21271C71cf0b1b54F64128C33': 6, '0x663CbbD93B5eE095AC8386C2a301EB1C47D73aA9': 6, 
'0x8990D7555Fee1e164b8CB09A6fA51Aa616f32618': 6, '0xe02a802E96446e904994Aa3D337B4B687ebB7303': 6, 
'0x24470B4C6CFD6901E382429243a533acE113B8A8': 6, '0x6946d60fa94039b08332fe24E5927b047678AC79': 6, 
'0xE0F5Cd816090Bf41332D117635684e0c5f76505e': 6, '0xb2434A63ea229716BcEd8338bf177412d54618d5': 6, 
'0x843546F9DEab5447d239f9cbFc26663cd270c8D5': 5, '0x0E5A835a15b7eCF5285C4a9C0bE4747ff2d82ab8': 5, 
'0x89d492909b28D2a51d26D03a735Bb180c0dc9F43': 5, '0x331E1a893Ed611427f9C54172B208B7D23E4c263': 5, 
'0x91C470e64Dd8082dbbb3ba885e04BA07117239dD': 5, '0x1F691C24D104B6993F03EB3C36d2Cc95EAa42063': 5, 
'0x691eA013171Fa2c0a5f98ab32393703aaF1ac051': 5, '0x5280B7aD2aFF8872C4110A0EA2E919c616F55D19': 5, 
'0x3534f8AB9f7b412373D7D990ccC2f69AC04b2078': 5, '0x02523F5c440f09ae533600CfC0999ce30df2a523': 5, 
'0x61D54e6F966F04Eb5889C64cB771CB01AC9C9032': 5, '0xbC903584838678bEEc9902b744252822a6d546C2': 5, 
'0x66770aBAA1a565E4876dEcc828c92b506616472a': 5, '0x3072bAf800A789F33Aae39D6e726a4A37615ceb3': 5, 
'0x4F88B7c5d88947155A31E18c3D57483Af9f2eA6F': 5, '0x62eC513d096BD5949951224c1AA842f74C638b4F': 5, 
'0x174E0b45C03318B0C9bc03573028605B26764931': 5, '0x327260c50634136551bfE4e4eB082281555AAfAE': 5, 
'0xfdE82eA5f35755144b9D0EC901832704cb2164F2': 5, '0xF30778f26B074f581C423f05a33629D37eB5538a': 5, 
'0x7486A3A5D5E744b2bC3D781f0CCe7Df196b3ED74': 5, '0x60f48DAaD316deB5cCabb7AC9438Fe710BF7df31': 5, 
'0xEa6232b4d2d5f2Fa1E7560Cd0C4E1B2c976e6649': 5, '0xFaaDf0C804689Af0571f269eeA8073A196f891F7': 5, 
'0x512e6e9f8A31aAc348e532eb4BEe05f602801A97': 5, '0x6D714E76AF538fE76aa81a75B556686Ad6002023': 4, 
'0x0CFd800dda45Deab1e7A03f5B8b4C9E0c1b659Bb': 4, '0x7f52ADd1899886153A53B2b7A84A49417aCD4BEC': 4, 
'0x1376BfDF9c7bF1F76de51539d403Bf4FedCaB245': 4, '0x4Cda7590079425792310D57FcF841a99e3f008eE': 4, 
'0xb44543524B633D665Fa54BE16FA408E70774D270': 4, '0xf32dBA867F8f74D07D9E508422ae4f29939991a8': 4, 
'0x7f733E416d96a6CC3D0907dd35b7c3C7fF23ddcf': 4, '0x6109be321E35104f52aFf32F47AD597cA361e4Fd': 4, 
'0x1eBB2AB70b38037d1ae40Fb6AbA75150942CBc63': 4, '0x323AFACD6b9C993Ac492D27488bC48E467d34DDF': 4, 
'0xBfC76C6eDC762d0E2885371A8FF32776DF05B8E1': 4, '0x16f5efdfD8baB94599D21b779e1a83992e876cd4': 4, 
'0x0DD7397E821a042621DA96f6F546FFFB7eC4c18C': 4, '0x0d9fBd3502F0f5060E5a6c958f7b3f9082c16dD4': 4, 
'0x36542BcC7f8E41411bEE40B878182F57F006BCfb': 4, '0x9FEF46c2e08aA0627f03B8402000ddfC8fbd42Af': 4, 
'0x4C685d099b6E181A2774D210Ce690D98EEBF114c': 4, '0x22157C72aB16A98897B923F9A5819449a7e2e877': 4, 
'0xCf41178e0cAE221AC0f9392e5042b5bCf83486d7': 4, '0x9a1A5bfB7d6E6025686CCa945f8104f41786D28D': 4, 
'0x6465Ff845BC571Ad991454A3E6CfE3790d369cD2': 4, '0x81fBdc76B1f43aAB05696823236F6390Fd4A6b6C': 4, 
'0xE22AeF354A07D187510f7642c2FA57Fe197E7A64': 4, '0xda3a223D32B8ad2ebf67e26B955B038c81f7146E': 4, 
'0x52F6d6E1dB786c8Ce34a1C7BdDeec27DFc231A16': 4, '0xAB8Dc8012A783a96a77d7f6FAff453Ba99838fCC': 4, 
'0x7239A3e5d5FdDDBfeFC56a08F1843090dDa79d2C': 4, '0x0f2D9bD536037e0a99c28662290c929e85E0007E': 4, 
'0x7C5d0950584F961f5c1054c88a71B01207Bf9CB7': 4, '0xFE3e5Faa4A32711ca7D2d324417097C5eB20552a': 4, 
'0x43e304Ef672A38EaD0871ec4785Cbdc3C51Bca3b': 4, '0x66283163ACAb1BB1aF6b6cE7E05e1C81E1328e32': 4, 
'0xC4530F313dcbE0811eC6B3362c575FfeeB176eef': 4, '0x530eC9b1ff88A2A4bb5DbB510FCf1F9D17aA3258': 4, 
'0x6125e6DdB5E18CeAecD889ba07fd59C131Ffe20e': 3, '0xb4560B49aed81FFa20A3e86fBF66ecbcae04fb22': 3, 
'0x13B873c7F2DB5d534e12551c65e337457f8c2015': 3, '0x8Ed9e1f3b9332a12E9625fE971Aed0C9a4E2a99D': 3, 
'0x01B984Ec0d745Ebd1001768E8f791B7C60df82DF': 3, '0xa9C6fb4E6F0EE89Debf87DdDEBF44Db88bA5f3d6': 3, 
'0x12a7e5123BAB8c012BEA1B1A948C15B340718229': 3, '0x1C79cb8Ce8C3695ed871E4D4e4519D937630832d': 3, 
'0xC7B158B10B0bB26bF0072aF363c04927B60342dF': 3, '0xFF0DE408D201b913837Ff5Be08815b7655B5d6da': 3, 
'0x0135D9c6569f1f26376F7DA2d56586c9C7282474': 3, '0x1FF0773ff42943e5C7c70fb857334bb81D300cDa': 3, 
'0x4B9Ec48659D7BB8C3B953658F8D2c626C9cfc669': 3, '0xC6080FC2cDb2C25CDa6bD72985780dE26C5e6203': 3, 
'0x2446D0Fe454AAc8790a69aF59f4463394930641b': 3, '0x751683968FD078341C48B90bC657d6bAbc2339F7': 3, 
'0xC2CD219c26d0615489bD347330fF041b8f1AFAd6': 3, '0xF35232a826eE477e307b9998456b911Bad9509c1': 3, 
'0x6ed46E3c84fbed89A1A423754A1116089Ab16Ff0': 3, '0x3a2bE14DbB1C679380d1f34a92CAA128BEe1Fa77': 3, 
'0x57B10be857f3f4Cc65b9309D8415630F6b2F91C7': 3, '0x5Ffb147B829a69178e8c8A2F0faEaF4722aDdA60': 3, 
'0x52ECDF3a2ea35A504914F723a181224A94cCA3f2': 3, '0x1C4c91BC615841bA8e414d4F5BC307acb09646c0': 3, 
'0xf2FEEf7Ad3F9BA8964b381Bb3516b9070833d4c8': 3, '0x0F986F18A9875F467cB2E2Ab7e1EaA3A70E74079': 3, 
'0xB527EE3B73614cFfd24e4FC92f2eC08EC789459c': 3, '0x2C1ec76e2fB8B8f070b4687C122e8dee0EC79A63': 3, 
'0xe9915f0be04f0bEc270C254951ca77df913fd6fb': 3, '0x36F0776d1f85d882524ff9a864A6d6160c5aB043': 3, 
'0x959D4caDcBBdE02bCCB0211Cf9a4551c8336dc7d': 3, '0x376731891C47fAb75ccf690ad9afc6D3FA4a46c8': 3, 
'0xfBb53FD8A60668C6396cACB1168cDF04998f2992': 3, '0xc6E70913bE9CDaa9Ea31617A21eD31adb294bE6B': 3, 
'0x0B7Bc8898E2D5e22D7a051efEAf2AB17A2707280': 3, '0x518fb1E307BD33C8cDd191d96009cFbeb3165Faa': 3, 
'0xe6123006981055DbC8f6906861a2a506D751BA9E': 3, '0x2B6272Da4872C8727C3577dEB0e77bADf6a61636': 3, 
'0xAB435C2ecfEca8cDD27F8a3c079e5258b6E988A1': 3, '0x0319bCA15291bFB6EED82ba1bDf84B27bdc1b0fC': 3, 
'0x78F8d2e72e66890eE4592c8a3c665Ce19A89a7E5': 3, '0x5611a7a6d5E0CBa0069E19Ee3647FD31f75C620c': 3, 
'0x8B90753A76CA2113C94d0C13936c9f03C08FF8e3': 3, '0xFff1F570f09C073b6621c032B6072847Fe9d6fac': 3, 
'0x6D39049710a4EB586eF373C47aAeED551843084c': 3, '0x35A4F2B135E3C1b49F16e3c8D6aCCDccaa98b6c6': 3, 
'0x8B2Efc253ece18e2d51d68771a085C14DDa26a5a': 3, '0xacB7CFB56D6835d9E2Fa3E3F273A0450468082D9': 3, 
'0x5555CFde0932C1f8Eff8B1F33BE4C1AAbeDf5D78': 3, '0x359B0ceb2daBcBB6588645de3B480c8203aa5b76': 3, 
'0xF6A034476b277674B003ABbeAa2Ca3a483F31dF0': 3, '0xb15874BDCBa04d873cBf79bD8F12606e9A5Ca079': 3, 
'0x916A6584608211887aA7e135147783Fd05D08ceb': 3, '0x099912EF8e174958718796be02bFBbB70AaD41de': 3, 
'0xDA9E30C9ad2B720Fb6037bAB20326e28cc04751D': 3, '0x1a71f50F1fD58129C03D05Fc71c00DB6d8F6b4A6': 3, 
'0x37f7b388268ad9fcB0BcCCce1aF20A8B9cB43C9d': 3, '0xe1510d078Df5aBd33eF403730b75c12a5c668D2E': 3, 
'0x4cdC6121aD65A0e1A0e1e7F408e6BD0B86148498': 3, '0x26F0181CaDCe307678589BaCB1dd6624E547D55A': 3, 
'0xB221399c52686E32F93b5dab6c4C7D3c8B1BBe11': 3, '0xa351B3117e76F1810c5857A68907aC8FCe2B7d20': 3, 
'0x958f598b383518542f5fc6254264599cdf613FC9': 3, '0xD3392d30E69a4AD6590e97d4EccC16698332c4F8': 3, 
'0xFb328c8681A48d63FC7D57645D283Fb0846E6Db0': 3, '0x7B09D96d2692fF85d3cd04114D88d5884b1b23AD': 3, 
'0xbCD593d534082b924a746D3264dABE4cA8219401': 3, '0x3ca42cB29F26B214ae6Cfde4001012CdD2735c13': 3, 
'0x06996fe7bb17B944D57d687055c6f090168a9fC2': 3, '0x84CF8A46e6F77dBC6A33855320d68f7A1698C528': 3, 
'0xF762292240F08EB26BE68B777188eFA07944f55A': 3, '0xDD3410feC655e9783b54848354E6A114A017189B': 3, 
'0x048731a642D17937d3b44f43bbAa8dFA2108F39b': 3, '0xDDcBFa9234D1E6943dD6707223Ef089fcb965a87': 3, 
'0x09323fF03AdD65b4EaCE2D2469EdCeAB0Caa6d42': 3, '0x157a86bE7F766908C4BfFfd4985826b8aa8fdC2A': 2, 
'0xbe6d5E0883E1256e53a02566D68014D9148542Af': 2, '0xf0e52218A721bec51cFfC3AFC8E3bBb9EfBC8293': 2, 
'0x34BDD73318e8FE2747f8FF0638a757d366325491': 2, '0x834A16D02aB89d825941C582843cf6Aa3439e83c': 2, 
'0x9eFaE605464d39f2EF3704840c9F0c39d484fE90': 2, '0x229eb2BA0c94493A8b51d494615eEBdC500E0366': 2, 
'0x83bF976A5b2FA41cC7B7127F4e69BFB1f57EbF98': 2, '0x3270F82CdF044e886988d90e23708f0fF53b5C47': 2, 
'0xdcA659C8C58C6506407E62677fd139357B70958a': 2, '0xa5765a698879e3C11cF0c0e8C399e0C40bE7aD94': 2, 
'0x3d501Adda52a1Fe5B42DA2Cca0240a7718a5227e': 2, '0xeA981f1F3b4725FB3dccC5D6e7d6C6EE730A1aBd': 2, 
'0xE5350E927B904FdB4d2AF55C566E269BB3df1941': 2, '0x724158F27466BF57C71AdeA8299B0a713d84E3f2': 2, 
'0xD493445CC04Cb2a8d4d988B1499a9F8ebc1e11B6': 2, '0xDFB5332f9a6AdbdECdaB2e99F1B4924De5778F46': 2, 
'0xd1892d3B28BB175eA4BCeCc85a1Aa364cE57E1CA': 2, '0xF131c4dB1D11a19765d4336B6cd68772AABe79Fd': 2, 
'0x384F4861Ef5bc1F4918E19C9249c052eC0699Da8': 2, '0x1c761d1fDEC934E2E8507c3cCD42bdD8610D0F2C': 2, 
'0x3254aCEEAca02B2ED58F2C45051F4A3398bD48E3': 2, '0x4215b72Be9193704Ca25287DE1Bd4bdd18e66f91': 2, 
'0x76b8E04B4a253d6E168F0B39EB0D75C786C8E0A3': 2, '0x12fB4b0DcF1969Be83DfcBcC934D9191FCca0AAA': 2, 
'0x700b658c2BC81EAa68d91aa0a026c5a1F8B73Dc6': 2, '0xbA13F8ca237B16F654E0Aea1f8F434ECc9c0214b': 2, 
'0x2337b31A8E6c402677c94973A71Ec34a6b719bd4': 2, '0xD9a9e83f71f63C2B9677b24380ccA030039A3A43': 2, 
'0x6D52374f01C0EeF7bD8ECe5a69b93fb7d61c5721': 2, '0x06640245eE13d9a4a2d4770019750635d12D38cA': 2, 
'0x2Bb0317bE7DAfa1D5Ce6904F16166C7Aa56e2afc': 2, '0xe7BE4906f631d4f8C0b7AF22912A36Eee7475A1E': 2, 
'0x83ffB38218B4098904F2399ABf2d281CD4A13998': 2, '0x4625494Ce2005f986294353125C47e1115C5Bc42': 2, 
'0x070E932611C1ffE63d540cE62C6ba87c5A427a6b': 2, '0x374e59403C3C1d803EbFc9C2F0c528f6c6518467': 2, 
'0xF0bf714956B8cC5e8b1DB5B3F2f868fC423F9eB8': 2, '0x2d90201F44CA39176927E8724691534d94006fDB': 2, 
'0x11d5F45239a2833a0a95596B1317A36Cb04b5268': 2, '0x4f997425E66d6183bCf4853F1f20087523821C33': 2, 
'0x4f9861628107300FbB4981eA22B85Ec0c348fd5A': 2, '0xe0AE2961296851bF3eEAe5DDc81bF4Cc8634dceC': 2, 
'0x55575F23A16538e9A2d1c0A1062047558bD91Fa8': 2, '0xEc23615309Aa1F56d5D01647E9C5d562Ff375Ba0': 2, 
'0xAbe59C7064e26fe156C988F2f7670b4963379c40': 2, '0xb1305C6B59634E6a9E3E945471695F90e5399434': 2, 
'0x5A4c760AB1bEf98CBdca8Ce69398d740c2742bdB': 2, '0xA9f4DEec01598c34509B1A41c0323d290582E27E': 2, 
'0x0b5A3054E7d7c25c23eE8B7fD7CbA3d2660Bc6A0': 2, '0x4D3c5cF298eE549978057674e8efcF3E833369A2': 2, 
'0xAf49F794f9e935616EE2fd9Aa659CbEC25BAc854': 2, '0x5207bf2fC28E48CCD0A556246761D5fD5c94b57f': 2, 
'0x3181731945D495f4Ed41C423945650ee21d5D68e': 2, '0x30039AeAAa203B660db1e09388550341523f854d': 2, 
'0x8f24dD657ded19910088E93295d680d9854b31A4': 2, '0xc992a9F75Fc162B91a481EEf9aeC47465218C91A': 2, 
'0xA8974306Ca760608B64bB68475eE39285F520578': 2, '0x6327DA5284187fe63952DCd954C0b8Df1F478f3c': 2, 
'0x2236Ad5ff0CfC27be62bA0852633cDA07A82E8Ac': 2, '0x1cc9FF8fbe1Ed15c3E276FE6D209aB5cc0b450F4': 2, 
'0xfdB924D2580783a925a62A051ba1FD2293D93eF6': 2, '0xb013B41BDEF3FeD6CdE651E9f2Bc2fFD2238BAd4': 2, 
'0xaE6085F13A114689e92A4b220025ff2cc9EbBf6D': 2, '0x38d5aD834F464d441444e53588e65DECCFe326bb': 2, 
'0xbfaf9BFa09F26EF8104A6d5FF09afdCC9300E5bc': 2, '0x2B0E4276063Ea28a74a6731736e4531a04d31d31': 2, 
'0xd599981EA55319eF7AA856934104536A4DbeB9a9': 2, '0x396611148F9Baf8D3e42d361234e1d402a6Caf47': 2, 
'0xF670BEFbafA384fbEFF262dAE47d07F39D33f7Bd': 2, '0x3DA9254fE8f0F8CD4677CB59E436DDe0EECF6946': 2, 
'0xb73836e4B4d02cD3622BfA9E00c131D412942743': 2, '0x14cfbD1D60684F32B5B3466829D5760384618c81': 2, 
'0x65650290475eC4A6924E3C3145215492C25F74E4': 2, '0xD61aa41E1488dC1d486EE73F037b1DcE6Ec6D5B1': 2, 
'0xaE522d18D9eDf0b5c6997Dfc79b3eAD1363059F2': 2, '0x2d2BfE2389B7b3779fa04d101f75a89F6A62DcD6': 2, 
'0xDBef206584d2b84b625c7d78067aE977f8EE1A29': 2, '0x24a9db8f232948c2f64A4BBD68AC52A2694efa9F': 2, 
'0x0aa21643F1F677bda24e35EA5C8B53cc3ef2E7f6': 2, '0xeA7126082a70c7DC463D2921D18e4658e52de4Ab': 2, 
'0xC22dF6618CDcF18dF018FD36b7aE4fe1c832cf43': 2, '0x8218A1427C41eFeD3ac6951909bBdF4AE9bA566d': 2, 
'0x1F27af0bAd8A2c7C38E68f548716E4ac003A2F17': 2, '0xdd330c70b3Bf5A90dcA873b0d4c9F7A778275979': 2, 
'0xB4758DD8C0F274f6bf07CB3bB1E7780d87e18489': 2, '0xE55775b2d7e1C078a9c18992d71e1DBcCF41f43B': 2, 
'0xfec32E8C9d2E8458C39bC60EaD7a844eA26b5386': 2, '0x4efc3E587A4c3Ae0899a0F6e20a78393FC9E39C8': 2, 
'0x5C1aC93739aa3FfbD7cdfee0A75029446145021d': 2, '0x45135fA3a5Ad74e8eB690A1F68B063f0d1B0202B': 2, 
'0x41C671916784921Bf9848780900f49FA80fdd22e': 2, '0xF23582BBd8802C4E523eA007f6520A154e73202C': 2, 
'0x33043c521E9c3e80E0c05A2c25f2e894FefC0328': 2, '0x5c2E033D75ed235b0869E8Feee4c4794c13336ba': 2, 
'0xBF4eDA607d85d5C524154cC96352E87244F71F66': 2, '0x0d2DFfDAAA8cebc8a571f72cee303528f908d090': 2, 
'0xe92D73fde8B60d9EEF7B7A96EEA8B2929b9B02F4': 2, '0x96E52c341f5E7612012Fe2056CA32C49E430Ef8D': 2, 
'0x2bF7c93d750a1033409ca452F5C0aFE6c4126311': 2, '0xaEC9B9C153913321E5D1581A573576029E982D58': 2, 
'0x4859bee79aabb156E511D987519753258df590cc': 2, '0x3e3A4C795B0C4cA93AC21d8E4af6144FeD09e3E8': 2, 
'0xe2D6B72EfdD468395062de0E96725a9fB805947b': 2, '0xD4b0625E65F7D0b417B6386421AF629923D3f5F9': 2, 
'0xC4FAb8A76471F9efF479A28E28BCc7e3A777B043': 2, '0x92D6C2f25f5BF54824f3fFE27355cfF9a9C5C248': 2, 
'0x0057805eae8506E179ce8159b8C7e5509DeAd95b': 2, '0x6261309D7C9683DE5d9664b025d94fD702444ae9': 2, 
'0x91f30f5569B57175aC523391Ee54CF73e9DAf879': 2, '0x5c824caDb80B6A0677D1C612cF70A555D02B5b36': 2, 
'0x768FeF508a32CB16f1FaEB2b8986741e7845eF75': 2, '0x77d04e755AaB7b079a45aB48Ce2dbb30DEF8AeFf': 2, 
'0xa5C142E01153b28f5DA63Cd8C118F59765175Bd8': 2, '0x99ce02b15E68c6F085fFE647be4958cD47F7FA99': 2, 
'0x8387C8109b21b8cB463240d467C0E781771C62Fa': 2, '0xd62C207e0691fc900b802c24211e28e6955E6227': 2, 
'0x87dC3eBCE2eb0fF553f7810e8D404B845Bc5e34C': 2, '0x649d25EceBEC58D72cb00E93CC79B95E0946Ae00': 2, 
'0xA8301D71A651AAF080E83966485FACC61E9c23FC': 2, '0xA75107ad646A44adBD6C757c1a5bc3c1114648b1': 2, 
'0x53741bAc10321b0aBf983F77D3EeAFfcb7Cd8009': 2, '0xb5DEe38024fd830858230c04Ba4264aa2c8aeE39': 2, 
'0xf3DB7aC07BcCd5EbF20eB67ACedFC673C4A1fb75': 2, '0xf37e7b491ba3347639CfFf8A136EB72D93D02504': 2, 
'0x47730Ef452712168a1d05f4E5c4c123dcc5f8550': 2, '0xC75C35eA196EBFBB840Ed3500F82dECCC5Be1979': 2, 
'0x5fCd8fdF5864e2E414c6aa35D2bE0855d7C2143b': 2, '0x3ffB42f7e0f9DECa0e5f71DFc21e8dff8771809b': 2, 
'0xD0622e059e51E0EF14aA20A40A57E3B79E457CDF': 2, '0xB0a2Ef3c7680A265692252D212440C7326Ea1792': 2, 
'0x7A62c7A28817cc52a5ADD96f5A26a68575e0Eea8': 2, '0x0DA9Fc7A5b959524638DFDA7bd1A29A2642Eba87': 2, 
'0x3Fd36E2b01Db453b3790f658A024B27028206F27': 2, '0x7Cebbe93e945d5c01112C3C999a4607E9f49177F': 1, 
'0x8d908Da1899617f8E5A2Ee325Ea4EE8b85e36742': 1, '0x534053EE1101C78C3212c4d851895b885BbC3569': 1, 
'0xBA7314369DEcD65F29c26F9F49718Ff993DA22f7': 1, '0x2a6e7bDf60D6e9d8e5798A94326Fe902E203413f': 1, 
'0xf67D480D09FB18501385a17F12E09f565770EE17': 1, '0x088E4aBfDDe14F4a315bB9879D38F4a657cca8a6': 1, 
'0x024b058456FBd471Df42f0E0c31F78aBd895686D': 1, '0x45a551543362461482c0A5Eee033D149c1D04Dd6': 1, 
'0xC519a740538028f5F70A8806a28B33d06EF21397': 1, '0xcd97C87a7cf6B7292EcaEbf2180eAB7Cc168a77e': 1, 
'0x9796dAd6a55c9501F83B0Dc41676bdC6d001dd32': 1, '0x7bBF6c58849eEaEDB2498dc721985cB8e93426ec': 1, 
'0x1460dA619843C5b97600400Db53e3E88a49D5482': 1, '0x53938f795AB6c57070AAd32905a70A2E5961A887': 1, 
'0xac556a956502469E231FC2a9da49A5Ce7970De49': 1, '0xd3Ab3cE2C2cfa361ACd5981f569623F4abA9F832': 1, 
'0x692e039CCb724373A212f0EF7285Ce860E988Eb5': 1, '0x5fb6f3A4BE9F595C304f5458fe8E35b5ff55C728': 1, 
'0xff76c3d106a73dE1a3B5F5cd077A0f426718B291': 1, '0xb5D695193FC25e9b2E3588F9A45C77aE09D88DEF': 1, 
'0xC0F0DC02338Df1dEAF25f42117d21C7dD1765956': 1, '0x3EFf05d9831bf9372E0cB565765eb073A68694e5': 1, 
'0xF2D1387C78520050885BBBf8c289b965356C6cf5': 1, '0x2c668bC44CAB30788A67f2e5243Fca42a0B04667': 1, 
'0xB063783f4e85bd64C9bb727A687caA3f25B91517': 1, '0x04C56B9146D5b3712d01e050D8C15339df89CD5D': 1, 
'0xdE404fa410737650B69Dff08Ff3300Bc1eE9136E': 1, '0x631f759F1976a1BA17BD2387b7A36Bdfc2cE919c': 1, 
'0x660711B96D470C30dF130DdA77248e306EAB5262': 1, '0xDF1aa393D35EdB09E48D5d8f7dbdF82f9e3684ef': 1, 
'0xd253786AA276871763eEfd744EA5B52AE7e41C26': 1, '0x3d91Af11eaA234daF1FF1059C50e5d07d0465505': 1, 
'0xae9B9265e685C5eA54aBa272CA648f25D0b5A4C3': 1, '0xE742540DE72137c80163c4B7c8BE8AfdA8172B83': 1, 
'0x56ECCf730D31bC0d752b3e179D845C2A64cD1D44': 1, '0x7990E3d38279931BE8f396B5dAc50F0765AD9f9f': 1, 
'0x92da5AfedbbdF2aB6Ba5b625Cb6b8cdC129DB1C7': 1, '0xC446cB2D6E47aFdc1950CCF3040F1a58B79c03DE': 1, 
'0x55309De52662b3a0727DC64F4f4D63E224045984': 1, '0x26914B1c5A2b52D3A4E84c76C6C1a426ab426512': 1, 
'0x12d1D63648FdFCf06B91b2f7EA35fB53F4Cc93f1': 1, '0xF9178222a4bbc023DBcF25d41bfD4E62FE1E7A67': 1, 
'0x336C89Fb874e62EBE6B43e6e7fA2406228B46d79': 1, '0xB5C15865794BB6c5d022C36c808b55C2b7e2FC2b': 1, 
'0xe43e5199Ca01Cd653d31d086156290AB1c537D68': 1, '0xEE65c1BA65Fe86e77664f9B3537059a1bE926D6D': 1, 
'0x8333f40619Df344Ebfa46B47733B6682e06aC5AC': 1, '0x8e9Ce4016C935fA612FDC40bD8b9C662b4517f7F': 1, 
'0xe2B98eA1Ff6c5Ce464F23a1CbE745A9a5df9f459': 1, '0x7F44C9b78B6F7e6D86966094B34e43E8363D7Ab0': 1, 
'0x805BCD80cb4b6453e09313B372A7b62D1261af49': 1, '0x9dc16d22f207990D076Cc1f9a97B00b7515f21F6': 1, 
'0x3B4e44eaC542E8f213874e34f2c5014A1C278361': 1, '0x30167d62FD4Ba453e66d2aeD98506B67AE835447': 1, 
'0xdD66579d1af913A385c26bc21C1cc03afbc8C3fa': 1, '0x13c85afe1D5AF7629A821f82FEB409F60eDFC1a3': 1, 
'0x1658A95D08BC44111a93f7AFcaB8444b7e8dC0C7': 1, '0x6E9aB773812cC1002856c1E7487B237D0EcafBa8': 1, 
'0x651A7B585bcD4F047ea09c117f4Ae82DA58f5650': 1, '0x26D4ef83924f56629e20DE63cd0848C7CDACCF91': 1, 
'0xc17ff5e6df6Fa6d28Ef2f5bFeC50376fB7aaE643': 1, '0x18e41bb2205e0d87cE94474411d49c035c15B062': 1, 
'0x634426C3a318c6a8C1d3fe68d130976c256f60bA': 1, '0x00a052fFE1a486C88292F4B75b30C875b8ABceF5': 1, 
'0xFa485828fA7984dca8cea54Ecd7B9877b9f510e0': 1, '0xb5190ff65EbE5fEAa921B87Ec15cD8Bd9Ea8c0F8': 1, 
'0x2218627c41F03A0c00dbF07514383B331f86A295': 1, '0xcD54Cc88aC8bb4f437937b5DFa9C341570c6169b': 1, 
'0x7338afb07db145220849B04A45243956f20B14d9': 1, '0x80Be87632C1553bc72DA2d2bB0e225C3314f3f1c': 1, 
'0x4fBd2F3D84e2A5826dEce41578E31f089048cb60': 1, '0x95A71Da18bC0478858851D84Ad0f6DB427f1fCA9': 1, 
'0x4101400e327bfE31791066e9D53FEf52b9B4c848': 1, '0x43799E28b96D18548b496558Bc816A3F88C8038B': 1, 
'0xA5e05690757ED922500b4A5B3232210b7C8B5d09': 1, '0x90E0E78E259Ae3525BEaC2331Af9Fc6b86D7b9eF': 1, 
'0x8eb8a05960dB5793BB4521fCE7A2fF0fF5a05649': 1, '0xC171e5Db569CBeDa2E715408A76d331f42831422': 1, 
'0x1F7FfaE0D8237cADCf4f90b71B79d993144Bf672': 1, '0x9246f1C4f24868E678Fad180a0859392f8A4791d': 1, 
'0xC594DBdAC2D6381f10a282618A82A81F7AC6C1b3': 1, '0x1c503735D9888F1a8E76b9012163cc759cB7Ac46': 1, 
'0xA7ab5E5DE44e44A281A7Aa0161b84f10eD91E833': 1, '0xAECD2855e9cb725889FddAC8930b2D51D0e496eD': 1, 
'0x9eA16CCe430e010c9403074683D1722501c96B64': 1, '0x48D93F975613d98Af294c1be3C6b4fd8c388705d': 1, 
'0x135DEcF049910b52C97Be6B75DDFf492Ad21c2c8': 1, '0xbd84E5fd2CBC82aE4656c9f6ac359b64ECb77EaC': 1, 
'0x28E832311F9fBc2189AE8b7547db25844a4aFD75': 1, '0x116E242a87c1FE15b82d37C8772B834af9605065': 1, 
'0x7988fc0179715262E248144eFAA8dA1DB9713E2B': 1, '0x71DAD40AD44E3C43607150ee526b244429F7F926': 1, 
'0xa00e156f6427B1efFd098Ebf353E0eb27f20eC63': 1, '0xb25C94C550DB35BDc04604408D3eB9620Cf3C816': 1, 
'0x0F446a372d8782D1344A0f18444C2F35BeaF7FF9': 1, '0x8fE27b5a798F07A6e21d3Ee6eB33031bf89D05Cb': 1, 
'0x45dF28a209E2B4Fca5C6d14b6048e66C0133fc99': 1, '0xcE9b5D0692358484616B1e3A916a8F7903C7728b': 1, 
'0xf2A93aaBB237D66cC7EB6B3137C5748C48Ae87b3': 1, '0xa4186193281f7727C070766ba60B63Df74eA4Da1': 1, 
'0x84996fa06f857Dc6F12c352E90aAd6849F25ff0D': 1, '0x4FCA54bB44AbE853FF884e8b5DE032a2cc058184': 1, 
'0x6cf56e36d27282A34B4b7010AEd54694dA46b39C': 1, '0x2cead734192AE39B57123e995c2f465495e5053F': 1, 
'0x92B0815C439BA02339D32f44E1cFD5F5d1E4883C': 1, '0xe53235D7716cbe5ff37Ee31C8ad3aE03B4dBD2aE': 1, 
'0x5Cf978c59BC3C698e49D2FcBF8B5780C91c940dF': 1, '0x3801582a0A8D4138333f7f1322477Aa232093990': 1, 
'0x7aE831e8EF607eaD2634Ec1E9bCb95bB1f6Ff411': 1, '0xec1BDDec1d5F64E6072a3Eee0274423B17Ec0A60': 1, 
'0x564e2e46bc8E75EA219Dfb8E1236E4ad092b83f9': 1, '0x0Ef62C616398bb4ecfF34491058F3E3e8ee10133': 1, 
'0x9Fe9FfbfD57ab78D4d01973482258bfC4BB70bE3': 1, '0x1f92eE8cf6483677C0c6381C48e2Bf272764f0CC': 1, 
'0xcf79De61702711bb7ea924640D7D7C9dA61c6C8D': 1, '0xC21969c23a264412C791494EF8721e4A0429dA81': 1, 
'0x31e0c818F20BCD0b81b2Bd2c8aeE6D32175fA4D6': 1, '0x62ad43846d63a3893556dA035ba10614Eb3b2367': 1, 
'0xFbEd2f322c918363F6E663E00e923574027C5231': 1, '0xC1BBAd8A3B1C950e7ADEB6D635cE74Ea8450B112': 1, 
'0xf1D1283B1a4daFe4F474d8b35dba9e05Abb0e89b': 1, '0x5281cDF5400f8Aa3a53E5833e2B4cfBa3a751C1C': 1, 
'0x3Eb20db4aC03b6506361A7F1036dF8668C53f0f2': 1, '0xa1B9ae2662CBAbe791C4Aa42780979b671b8f4Fb': 1, 
'0x91A9D7D174daeA9cb0534BD870D86d19C6149E71': 1, '0x7818614Ff330B1c5C0C00f10710412f48927D1c6': 1, 
'0x1FB66F471C8ff7Cb6C4D55F01C3e5fCD582F2052': 1, '0x65E36861cBC102560055Ac5273d266bccb22cBB9': 1, 
'0xF6fd4eC926d83AdaDd725E67D4005763832f4679': 1, '0xA926dba5af1260705024969551e19771a4a86931': 1, 
'0x9141F07Ef507616662e2a19071811fAFa45FD9c7': 1, '0x145657AD6569b63B381d26eBDb742dEACb416839': 1, 
'0xd5809D70b81547D8ce989f86cf6b2fcD90356cF1': 1, '0x8Af2daa7271c0bc54cA97Ab3AeBB381e65b30E98': 1, 
'0x8fBfD009C4B6a99EDD7a1b9561e696A98b6E48dC': 1, '0x773fd91449CF5dE986d9129F28AAE224AFADd098': 1, 
'0x5111817277151611310ccd2aa2873ff0081F316f': 1, '0x71dd99490C5e36A22B2a73f31225fA5Fa40223D1': 1, 
'0x63e7549Ea16F52Bcb0415B308F17f3FeE6415138': 1, '0x326e9B471BDA976fD9764Bb3cC0C36F2586356E1': 1, 
'0x9Fff38292f193B20E6944e1c8bF3d671debE2792': 1, '0xa220E8f055077604C6707d401379625a5516135c': 1, 
'0x1bc354C79a3Ec66866C349bb2F64F4DF153e9428': 1, '0x91dbe200b4c203c846f4b1204B6528020580FF9C': 1, 
'0x828969582c50dF50EA10Bbc3003Bb6AA65D4929b': 1, '0x44254f62e73F2288222eb05C4B2C8Ed33c1F6Fbc': 1, 
'0x9dea281D138461Eb246100bD6a2AC58E2243EE5D': 1, '0x933FBf73a150Fe5380df4eF82C289f49e0a0B1A4': 1, 
'0xA4D06dBd84a7d1440C6683bb0473b37D6b20f97b': 1, '0x7E37d1400118126960a9739B7Fa9F1B3663c9e6e': 1, 
'0xe75e523A0011C976c8A2d171e75a0d8A4Efa6885': 1, '0xEA0364e1E5914342AFD2Cd8CfB49350a71Df3937': 1, 
'0x7Af638C962f7c427Cfd1ec42C1E32f1c618aacc2': 1, '0x2A9E35F6eb291FF803498938CFbf22976Aa1D134': 1, 
'0x9cE9cBfd3dEd8b0597bA6d750557F21bD2713C6f': 1, '0x3Dc99e74391f3A82e856A4Fd413b04aA3b342858': 1, 
'0x492C1C7033534B70E51BD034a85d4bD402cCd5B4': 1, '0xa1fcdfa090E79D883B4998d0d78ca624bB38B80e': 1, 
'0xfE5153Cf829AD526B93F8a4b36194aA468E2cF35': 1, '0xE9E6A241290109A37aC5C049cE7C88908d8f00d2': 1, 
'0xa3c73A084eA7E3a457798af8425319c30822ba5F': 1, '0xeEd99E93e073C092131C245C3fDa23781563d67D': 1, 
'0xDb7C387Aa3750C33aC17e388D1471aFe6b1964a6': 1, '0x3F84CF7F53451cFb79c68F1198e32dC94AeF5E02': 1, 
'0x48a79fA05477F58d9e6eB447b82Ea60A85823bEB': 1, '0xB99cd160aE4Ce34334CbB29cEf99Ce4cb1CcD283': 1, 
'0x095D325F2BD49bCB8C79F3e4867DDcde7B605eD1': 1, '0x63A4AD315684E9Ed54938b0eb53D6Ff28C316Dca': 1, 
'0xAFE9ae00478b2997E0F8F264b144be74bd3c7F95': 1, '0x870e228f9AC8ff0C8aF5C70c87Bad40BCDA2F681': 1, 
'0x5778Ab1AB0fB13F743Ce0b4e2Ba275bC0DaC389e': 1, '0xc3105F88C6C1aC83b48200A89a4D99a681e165C8': 1, 
'0x8d758637124A6dd371757853b9ab47278A0E5521': 1, '0x9b9E6Fd2e94153825D5fa5Eb9ee5F99574f03aF6': 1, 
'0xB5D26158102181dc4ceee75f260A60Debd752E45': 1, '0xd09Cdcb8c0252c39ee269044c69279de5B37386a': 1, 
'0xE6f2B1f78C44db1381Da77B28d4B49eF349a93c5': 1, '0x022eb98AB0f3636D6aaD549A786b82a180F32cda': 1, 
'0xbF5eEe4b536143f96f9931482d00952381d18b44': 1, '0x4DD01C76D1D1053CB12e5a3604118c6b49f223DC': 1, 
'0x7598047138307F52FCA61fCE6E489c2769C0Acd6': 1, '0x530B98A12d7C96AA37848BBEEb389e2f1694bf70': 1, 
'0x84ba027280cC6cc1e592a01270c5f21A494F46Cb': 1, '0x90d26fEC45754a9491535a7A4c9848bFb7ca1cD3': 1, 
'0xAe3C67b8aA12e458F2b4EafC0e9209710582C9D3': 1, '0x6A0424bcBa352288C70566d00CF964D4167aaCBe': 1, 
'0x399C526c1811DD598d9C7b595659BFe5857914D5': 1, '0xf2D539745f65dDBD31df23B03df2A17180DCCDd5': 1, 
'0x543E606675E291499557E647715BD1f2CC26b0e6': 1, '0x44Db3Af9AecD8c925A56885443eE259A31Cdb3C4': 1, 
'0x71D8Acb8512D57D0110d57B2Ee50d3256b18C992': 1, '0x7d9C5BE80dbD885E055Ccb6168068a4c38d8072F': 1, 
'0x4ec5FA6a4FfF7Ec823B45dB6d57f2716833e8147': 1, '0x13ea24536d08b7F552763f233cC544aD669D9238': 1, 
'0xB984b9492b80325e09E7ddAd1b52Ac49d5808e9E': 1, '0x7d786624574A18CE4D247Bd5Eac4473d293baD24': 1, 
'0xCE048c064107D0608A5B33E7cAB89C846431570c': 1, '0x1EFF6b29320Dd155a0A7F015bdfa80d490902B5D': 1, 
'0xce54EFAd213AFc1b074daaf55366AbDa7cD079Ce': 1, '0x4680B01D48f107928Dc75C3Ae5C8296D8cB0b5f7': 1, 
'0xB6A7e9Ed00E4bF3a565400CaC182C025398fe0ef': 1, '0xc0E7C12756954454937943316B2Ad99e4eBE11aC': 1, 
'0xD2aF4791EDe5c94d36DB056b3a5679A92FB7B0E3': 1, '0x3Ff000C35E217a8721E3ae6fdFaA8B612680d8c3': 1, 
'0x850CEC90edCA90981a3982bB6F06C16a59AB5F31': 1, '0xA7E23017E4A6398d60625a1827c73877Aa3A9C76': 1, 
'0x2e91993C3E91C32c313981b8F3BEde396a5a792d': 1, '0x1d59bcC9836c6Fda59CC240827232DE9007F80F4': 1, 
'0xD29BC8913657a16577D5A935Dae1F01634759A77': 1, '0xe98663D43908489701fbbAC081D781121B8457A4': 1, 
'0xaccee9eD56893B8725b9B2f9eb18bcDb7Cfc6433': 1, '0xba8C36c0E202F7a9EA0189C3899C8D18123562eB': 1, 
'0x8b354388DD766194C616dc97f22C5369E2BbaEe6': 1, '0xDf36999a33B1A9d5ED6F34a363bD14E58D4605ce': 1, 
'0x195e5BbcF011398fD599A11440A713181D4cf661': 1, '0xb1D3003e8Ef4Cd5abb98CbE7162eB42C7C36cdf4': 1, 
'0x713f08455674083cd78Cf2DB69506AEe1564C2ce': 1, '0x06bC3bd5d558F9aEB38e7f796e2ED88F69f7156E': 1, 
'0xd3cDCB7F1dC60C0B1B03884aC469aeB8Ae53AD1f': 1, '0x0612Bde3d038442858CBFa8508B47a9046F88686': 1, 
'0x9B367d3291EDd5c676D432C2Df7A487487aF388C': 1, '0x767B5224aAcc387A8238B4Ff198E4766913bfD17': 1, 
'0x2667a07337359b3B1876CBAc86C2549718A01765': 1, '0x2999cd1E7fe6C50d63AefA5255809E9B25A96d0f': 1, 
'0xC85D08c5C32A71FA7cE3f04337BCe833eC5863e5': 1, '0x1A97147c1F287230565Cdf021FD2831De2c21Be6': 1, 
'0xA9EAFa53D7B4758143D2A5b9B8563D4BE2209d1f': 1, '0xb7B1F23840AC93D6FfA281845D46e4818d026BdE': 1, 
'0x1c0F844C0187C6819b40a171FCab4dD2A947224F': 1, '0xCBf27313bD75fb058564948222A44D7CE35DAdE7': 1, 
'0x4385EA82E381d1c61b414481b3CEfC43AF63217A': 1, '0x84119e837dbeF0f4Fb877681687A2869b220533B': 1, 
'0x824A06eC521aAebC057baC4e0fA205B09688Ab9D': 1, '0x5121b50543355376c8bD4f953Dd2756E7bd1dF8C': 1, 
'0xDe8DbD4b478CFe819f2E8EC7212062428170f608': 1, '0x5df9a9d48314eE84b3963f1BC9bc812B595AE409': 1, 
'0x594A69EA90ECcB0c91b4f3F388fB6f44E724A041': 1, '0x32b9645b22d98F82E05463f0112473F29F58fBE9': 1, 
'0xdb094E9d2a746bd3373f2c8B7B7A5D4b7199bcA7': 1, '0x3A44740a8c668AfC6947a5c437EA073EB10B9B57': 1, 
'0xA7B2ae07a9063A51c94A5D608a9E8289f8e7bd2B': 1, '0xF307c85EE39AADD4182894e829e887f351e360D9': 1, 
'0x91D841298a146DEcBdB82ff550D31DDA649e15D0': 1, '0xc93995ae8a915b12bf9c4273b9f294426FdEd7f0': 1, 
'0x9c69e7FCe961FD837F99c808aD75ED39a2c549Cb': 1, '0x47721Ae11222848aa957aE9e6A3E87C5Bd960E37': 1, 
'0x9fb0683A7F8a73329584b4aF28C064769BBbD9dF': 1, '0xB2a119051d124d225CBa4439588e1F10B00690DB': 1, 
'0x10630c8130e44eD22D30d0A05488a10B44797a93': 1, '0x512Af6714d4E9b4d9B60284616EA1399506D901D': 1, 
'0x2Eb28D4e35d0D2Cb7e5dec216f7a34517AEbD517': 1, '0x7BEe2861b35B191627A5CC273dff883B8204b3c2': 1, 
'0x0cb961e87f6b7a7Ce4E92d1ba653E2A2b5b1D9B9': 1, '0xe94CF0dc1B935967144848d3352502F810dF7ac3': 1, 
'0x4173018983ab21D8FC3A469DDc4e649A6138230c': 1, '0x6B48F424207B40eAd939b89AB86078C2419640B9': 1, 
'0x0d9AF0dA1a8f921c3d7567553E807AE5090B6DCF': 1, '0xBCc23B25e23346A9270FCb0C7b499abB163c98C3': 1, 
'0x19a1a696Bfe0Fc0FDd8637f5CDf6bDAC91028203': 1, '0xf5FEc973Dcb58a465e18e90b712c09d07Ed8dEf2': 1, 
'0xb443780F8824B82D005C3264462566062F435254': 1, '0xD5418D3289321A68BC70184D1A5240F5154F5C07': 1, 
'0x78ae61c6E2919231CDF0B69C6d8b70119Fe82539': 1, '0x418f9816D0596989C88E1d093373684D075C5874': 1, 
'0xD9A3F2B1b9A8538992d49E577B684e3e84aaCdA2': 1, '0x357C538de7b6d7869f0bB6c93dcd0a25d6cCDff3': 1, 
'0xEA19342eaCC5001722C7864B1a4C50BBb8F94df0': 1, '0xEbA6A1e6103Fe3120B364aE32538D6967cCe4c8d': 1, 
'0xd5876324cb1D9DC11b7811557C545018465E78aD': 1, '0x1c695989e2a68360109aF925ba2Ca87EA62cf0b6': 1, 
'0x72B3355d061aC6150D898D9D2a2E5C78B3Fc6662': 1, '0x26B8fBdB56537a278A59c68F52eCC77c780092fb': 1, 
'0x3aA3075656df811A81f18b18E3A0De6EBEC97311': 1, '0x4de2BAA3576a8856d7A7C50A8BEbA53718b5Ec92': 1, 
'0xEE336aB74d0E8456385E510e6E70c6947450232D': 1, '0x215Ee436724deC41bD4ee9CaCB8900D886E02d08': 1, 
'0xFCC28F90Df84D78C49d310cEeDdd4f96aACBb724': 1, '0x110442daD0995aB2bF04513B02C19219521Bfb16': 1, 
'0x02C25C59F307E6855d08B2c6D4795e097A31200a': 1, '0x367C60d3B8E8a4DCB92fc8f373f2eA34D17D47aB': 1, 
'0xdc22Bb64132fB03467910fc49595F08fCf5C241b': 1, '0x16a395cF9C03aDFB091FF18611ff1dD7a931b7bb': 1, 
'0x1423Bf7991cDAa711a5DE056F755905cd50E44D6': 1, '0x9Cab29b34d1606e869535fEA17a6Be56EB4e8006': 1, 
'0xB01c3f3a79FD927C7F584c6cb5Cb3E354fdd8C34': 1, '0x75224e800636c3D397bADb4D7c544e09aDDd8E0A': 1, 
'0x03AD192fa0b2cBB67f1913F13CFb60B3E2eBf5CE': 1, '0xD5a0b399C63e2cE0E77DD32d81D8531a2b9eE6ec': 1, 
'0xBC74e8639F23B66Dd35883cb76F155bE3222EEa4': 1, '0xFe6066b8F2d173544b69C807f758425b59aEcd74': 1, 
'0x67edA0d57c2C13909761888d848077F058fDBc39': 1, '0xbaE1724cE707A1094116d4aBeb8a4CC931b981E2': 1, 
'0xdb0b82dBCe6Bbc363585D41D793732994F25f144': 1, '0x6E4a215aa1d3372B81aA89637484Da8aFc900F90': 1, 
'0xBA540B62B8Fb0985A7AD703f336fd74977A894d4': 1, '0xB5b2f8355329a3b30e31254199191f71999f1dD9': 1, 
'0x6b05d9E6c41d18365a8B1e471939baed533BF18a': 1, '0x80b29ED78B08eDFd29A69009994401F9bFd27285': 1, 
'0x5fD56780B491Eba06f148E464eE3cA48Cb0f93e8': 1, '0x62111959804b2Dd024188A1f28daA9Fa3028D033': 1, 
'0x679acFA49c88142307576581d79F91c56FD60A6f': 1, '0xdE896CE9622627d97A025636e772E27Ef1FE64d3': 1, 
'0x8ac55Bd6204Ee4874bd85A4c267C8194b0DD4449': 1, '0xaf9f64e16E09c32d9e2a960E88A7eb4347529008': 1, 
'0x2f3D5F9A89CBAb5982C56E6146056EFb56d4647E': 1, '0x2b5c4f9867c1300a2e4251feeE40F99126F698Ae': 1, 
'0xa84EFdfC9966df59835f81c9645d07D9e7C38cF3': 1, '0x7fBd12bD661b9C9C83F97cF944796A22c9Fa59B4': 1, 
'0x1cb59603E3f03585b25589A416330214016242aE': 1, '0xa85649069eb1b5AeFFEBEcF6bC6C021e053B37cA': 1, 
'0xB9b38eceF3c103B3A3332B7995C7A7E1c0d50e48': 1, '0x986b3293c5BaDeC36C6d8c652b0Ba6A82Ef5237b': 1, 
'0xa166e10e3966367235EB074AED1CC09E546a2092': 1, '0xfd0166b400EAD071590F949c6760d1cCc1AfC967': 1, 
'0x716b90A806501AA32632B3d833f131fa592E27DC': 1, '0xC4de38Bf2E543DC0fe09461CEb974E2EdFABFcF1': 1, 
'0xA8Dc6eA97607d7702AC83053dbb2A3CdB88A4e52': 1, '0xB835C63A0796F46F927a46DABcd183d4290d3541': 1, 
'0x143272C817e0fee45e7Ed963Fd2D954371aD2E34': 1, '0x9D3e3387b78314a3ECd6DeaBB9b7BB681362b125': 1, 
'0x90502bA22a43667B00d558Cc8872F02F1F9d8Bd6': 1, '0xb745EeDa2dB353a3E649A3774Fa759533CAf49F8': 1, 
'0x224a02dc5ADb3d2509dEe5b1190D75945D8442a1': 1, '0x6c0301A6915a404Da64b512E4aE48Aa7ec4156c6': 1, 
'0x70D6bf544BCAB53DA012a868e16a64849d81653d': 1, '0x9C1984127637175676B1bFcD1bBc4D04B34c70D8': 1, 
'0xB09f255289Aad8a9f9F10818D6C5FE619a202461': 1, '0x7434afD8E406e68dEbd8656b8E56B434f0E69B7D': 1, 
'0x2F6c780D9d70536c636a19cf33BB620413c4b51B': 1, '0x75708F2056B6cefF3E1D67185BF552Fd023B6baA': 1, 
'0x40fb5A5Bf5cDE381f30F3f8f3A754761f7239Bc1': 1, '0x5d9D226cd75C4bEeEC14f5b572D8bFB0Ed2046fC': 1, 
'0xc612Bda4A16C9DD2054E23e0bb5f16B8b073271D': 1, '0x8d6E1E3AE5ccf35F59bDD85C794ECe2CBaeA0842': 1, 
'0xa6a36AC638F361e14f4252233e497a964463C2da': 1, '0xA4B6EeEb7EBa0fc360A7402F2eBE90C178115e91': 1, 
'0x328cdF6fCc267f7779220b01569876f8F4A48b06': 1, '0xb8AC78Df5BbBa2235cacbC4E2b84b2094BbdfDf0': 1, 
'0x5F3307D3AfcAF5c8A5EFF60d836CB8397709eEdf': 1, '0xB498446d6B701407fed1F34a1A7328df3Aa32308': 1, 
'0xE146801D03cf106a400FAbB91e925CEB5B0C4e89': 1, '0x43ddCf658c98c20562524FB155dE3A4F6aC72f9d': 1, 
'0xDCf6714a2e218Df5B4164aD4d8c5f35D01D9acc4': 1, '0x1eCC4a46c2040A982C96F4e3e6D099c7E91afD85': 1, 
'0x2dbCBa8599B631269be148f5426d1d072704fEB6': 1, '0xd8e3F658D763d31a9DF75411758b928b6D5042A9': 1, 
'0xF202C53252d042300b695Aa06438eA1Ee644553B': 1, '0x7F8b96F3cE3D6Ccf73FF57D1E357F9D614F3a366': 1, 
'0x8686Ed754F0c75afB97918EC97d78E5b2ec6595B': 1, '0x85b92ac0E9FD911f3dC5825Bc0ba4fe4fBA1d4Da': 1, 
'0xD5C4d2d852A75b54dAF2138492b2e1f25a36FABE': 1, '0xAc47224B08949a5F585FEEB8Dd45c71801716136': 1, 
'0x693dd24191c062F8f453029162C64CB63E1F1027': 1, '0xEC2d3df5Cf9C46764AF295A0d5d5e07d84C1A329': 1, 
'0x901D258E7E478731254F7312A7c9f0B0d5851102': 1, '0x350943973B59Ae644013304C896cDabBEE0C681b': 1, 
'0xEB7c213F321d4a5FCE0ceA18304f83E0288ebd82': 1, '0x9Ae36ABEcC2604083FA61F107E7B2fb0920D3603': 1, 
'0xef47536D66255B9c05938768d2dae4A69787F6e1': 1, '0x1C2d2C2258c522bece4E027b1088b26c131AC98A': 1, 
'0x4233A66cb9950eeef0FfFeF7488C6da562AEe855': 1, '0xbefcF37A1a9658eAE00806Da72a85E971fc8f454': 1, 
'0x4B7597C6D2DE8c9CF1A6468Cdd45Dd0044fA277e': 1, '0x54445C49aa4b4884d5F9423f00c26ADc7e305050': 1, 
'0x533Ac1cE767a6203dD6fc9031DBafD84FcEd3E40': 1, '0x104cd3fB79B0DFd538EF74eaDa94474E68206d3D': 1, 
'0x1EE11a0559BA7B2e6E4A216210a455c341E71FD5': 1, '0x4C409d30aCc4eD63F213f226c2cbBfDeFA8294D3': 1, 
'0x73c4F3c5a5B2C9d348dEAc9E88A03D8E7ec1C1eA': 1, '0x78856c57E1968F8C6619F58475b2A845a18F30ce': 1, 
'0x376Ea33B1c65659f6f7a848FbDE285Ada639949B': 1, '0x748A2f2d0956d66bD0312B0496856F979f673439': 1, 
'0x6B8eDF4145a8523BCC5d7a766e7C776F073fe082': 1, '0xa2DE30D3BF69d3fc6864eA4db92276B8378f67BF': 1, 
'0x32fe7ef12B015d0CA0eB4Efc063dCc3D2D1Cb61c': 1, '0xeBfB1b6DfE064Fc69531C124609Bd24ab24ec30b': 1, 
'0x153695e57A1f47918A93a484Fa1CBB251bE9DE07': 1, '0x44F48B8C4ba9Cf527E55a24d1411a96D2E37ff7b': 1, 
'0xA1D302a3e8c2f6E1Ec4321269cA9BdFa2C8981d9': 1, '0x2a72C2D83C5187E4240bf47Dcf24EF3C2C1ca30b': 1, 
'0x488Cb2cE2C8B8E8dfEf4ce0EAb4BEc3F20b1347E': 1, '0x168FbA9EFF10DE68809bcF2FD5A8ce20af2fbB3c': 1})
⚠ No max bid: Counter({'0x6BBbA538C14D36eE92dd3941Afe52736c5cFb842': 69, 
'0xB81E87018Ec50d17116310c87b36622807581fa6': 32, '0xed40002F46D76224e44E314a19b2e053e55c4E17': 14, 
'0x5D55f5453619d9DF806f9a9Cb2986A919B4882D1': 13, '0x1De3626d6fc2d7c14AF8020B5E8A0c3371D9195D': 13, 
'0xA9c8550BffD4bD11c09da4a807dCC3B87C71B481': 12, '0x24D2706C07ff041DB342Bd72343Fd79E06129802': 12, 
'0x53829Cc7E582F5D9945d1bfC0e2Ed8B271202592': 11, '0x207417bB9cab68286534543a1ABD697d25F71877': 11, 
'0xc5D291607600044348E5014404cc18394BD1D57d': 11, '0x4CeCc37345ce702fA6285Ab9098dA34654Ee0471': 10, 
'0xc2E11bA3A515240Fc4D0f4a86B8BB79dF26f9F8c': 9, '0x101B8fDa175d0d3A3B4aD15418fC068c1c3866f8': 8, 
'0xd9D3106bfa3f242BbCa1416D1Ccd95fE109c3CF8': 8, '0x72eD84c5232a8e0bF88aFF101dd9C3fE30fB1AF1': 7, 
'0x0ccdDA6523B8BCAE8B3Ab407623EE073495C5ee0': 7, '0x2b6fCa9AD7EBd5408dB009f0DF087Ffd934cF98e': 7, 
'0xe39d21C97B5AA55C9c11A968a76bd3B7bEc552e2': 7, '0xd20e9C66264Ae040e89C90af0C74bED97fD0BC65': 6, 
'0x6CE82a2FEB8baB345D14f7a955d2daaE4fF9d83F': 6, '0x5945459c5201e21Ff409C9608600D0c0d5f91635': 6, 
'0x4FAefA6c1ee5ABeaB54E9cF71f7913697627755D': 6, '0xAE8E389E2940D937f50De697f350DD86f8AEE93b': 6, 
'0xF3a88FAE6Ffe731015FB53fB2fa193c9177f87E3': 6, '0xb2434A63ea229716BcEd8338bf177412d54618d5': 6, 
'0x331E1a893Ed611427f9C54172B208B7D23E4c263': 5, '0x5280B7aD2aFF8872C4110A0EA2E919c616F55D19': 5, 
'0xbC903584838678bEEc9902b744252822a6d546C2': 5, '0x3072bAf800A789F33Aae39D6e726a4A37615ceb3': 5, 
'0xe02a802E96446e904994Aa3D337B4B687ebB7303': 5, '0x7486A3A5D5E744b2bC3D781f0CCe7Df196b3ED74': 5, 
'0xc5DbFAf13F8B0BaC6DEF344FbbCFef06aC84eef9': 5, '0x42E36a7B30Aa8eA8bEC7B64170e40aeF20B00Bee': 4, 
'0xf94860Ea703aeBc00de50F3433Dd2F9306c72CA3': 4, '0x4Cda7590079425792310D57FcF841a99e3f008eE': 4, 
'0x1eBB2AB70b38037d1ae40Fb6AbA75150942CBc63': 4, '0x0DD7397E821a042621DA96f6F546FFFB7eC4c18C': 4, 
'0x36542BcC7f8E41411bEE40B878182F57F006BCfb': 4, '0x02523F5c440f09ae533600CfC0999ce30df2a523': 4, 
'0xEA19342eaCC5001722C7864B1a4C50BBb8F94df0': 4, '0x62eC513d096BD5949951224c1AA842f74C638b4F': 4, 
'0xb4560B49aed81FFa20A3e86fBF66ecbcae04fb22': 3, '0x7f52ADd1899886153A53B2b7A84A49417aCD4BEC': 3, 
'0xa9C6fb4E6F0EE89Debf87DdDEBF44Db88bA5f3d6': 3, '0x0135D9c6569f1f26376F7DA2d56586c9C7282474': 3, 
'0xC6080FC2cDb2C25CDa6bD72985780dE26C5e6203': 3, '0x315621eC6341b4181Cba6e31844D0dcaaF628463': 3, 
'0x52ECDF3a2ea35A504914F723a181224A94cCA3f2': 3, '0x1C4c91BC615841bA8e414d4F5BC307acb09646c0': 3, 
'0xe9915f0be04f0bEc270C254951ca77df913fd6fb': 3, '0x959D4caDcBBdE02bCCB0211Cf9a4551c8336dc7d': 3, 
'0xc6E70913bE9CDaa9Ea31617A21eD31adb294bE6B': 3, '0x5Bd353C49fe776b9Bd0661c1D86ADe344d88D416': 3, 
'0x518fb1E307BD33C8cDd191d96009cFbeb3165Faa': 3, '0xF6b216dd90873d07e45635AfBBCd1B46A490dd7b': 3, 
'0x9b864a921b4BF45725aeB00C083B956C7467e67d': 3, '0xe1510d078Df5aBd33eF403730b75c12a5c668D2E': 3, 
'0x26F0181CaDCe307678589BaCB1dd6624E547D55A': 3, '0x7B09D96d2692fF85d3cd04114D88d5884b1b23AD': 3, 
'0x9eFaE605464d39f2EF3704840c9F0c39d484fE90': 2, '0xf32dBA867F8f74D07D9E508422ae4f29939991a8': 2, 
'0x7f733E416d96a6CC3D0907dd35b7c3C7fF23ddcf': 2, '0x3d501Adda52a1Fe5B42DA2Cca0240a7718a5227e': 2, 
'0x724158F27466BF57C71AdeA8299B0a713d84E3f2': 2, '0x751683968FD078341C48B90bC657d6bAbc2339F7': 2, 
'0xbA13F8ca237B16F654E0Aea1f8F434ECc9c0214b': 2, '0x2337b31A8E6c402677c94973A71Ec34a6b719bd4': 2, 
'0x2Bb0317bE7DAfa1D5Ce6904F16166C7Aa56e2afc': 2, '0x83ffB38218B4098904F2399ABf2d281CD4A13998': 2, 
'0x9Ae36ABEcC2604083FA61F107E7B2fb0920D3603': 2, '0x0d9fBd3502F0f5060E5a6c958f7b3f9082c16dD4': 2, 
'0xfBb53FD8A60668C6396cACB1168cDF04998f2992': 2, '0xdBC41aEAeA480459386feeC0C575F7ca56e8FfF1': 2, 
'0xDBef206584d2b84b625c7d78067aE977f8EE1A29': 2, '0xeA7126082a70c7DC463D2921D18e4658e52de4Ab': 2, 
'0xfec32E8C9d2E8458C39bC60EaD7a844eA26b5386': 2, '0x8Ad150eeE60Dd2519Bb2713cCec770B0fe07a1ae': 2, 
'0xC4FAb8A76471F9efF479A28E28BCc7e3A777B043': 2, '0x8387C8109b21b8cB463240d467C0E781771C62Fa': 2, 
'0x24470B4C6CFD6901E382429243a533acE113B8A8': 2, '0xE0F5Cd816090Bf41332D117635684e0c5f76505e': 2, 
'0x78a47e8041f0F34b52dDfD55ed0d4Fc8c0435995': 2, '0xf3DB7aC07BcCd5EbF20eB67ACedFC673C4A1fb75': 2, 
'0x42B7001cc7FF472f1bd871876cc485b8d12975A8': 2, '0x5fCd8fdF5864e2E414c6aa35D2bE0855d7C2143b': 2, 
'0x5AED3d3382993e893491D8085f2AAB00Fc8A55ae': 2, '0x0DA9Fc7A5b959524638DFDA7bd1A29A2642Eba87': 2, 
'0x3Fd36E2b01Db453b3790f658A024B27028206F27': 2, '0x8d908Da1899617f8E5A2Ee325Ea4EE8b85e36742': 1, 
'0x534053EE1101C78C3212c4d851895b885BbC3569': 1, '0xBA7314369DEcD65F29c26F9F49718Ff993DA22f7': 1, 
'0xf0e52218A721bec51cFfC3AFC8E3bBb9EfBC8293': 1, '0x5e624FAEDc7AA381b574c3C2fF1731677Dd2ee1d': 1, 
'0x2a6e7bDf60D6e9d8e5798A94326Fe902E203413f': 1, '0x45a551543362461482c0A5Eee033D149c1D04Dd6': 1, 
'0x3270F82CdF044e886988d90e23708f0fF53b5C47': 1, '0x9796dAd6a55c9501F83B0Dc41676bdC6d001dd32': 1, 
'0x7bBF6c58849eEaEDB2498dc721985cB8e93426ec': 1, '0xeA981f1F3b4725FB3dccC5D6e7d6C6EE730A1aBd': 1, 
'0xd3Ab3cE2C2cfa361ACd5981f569623F4abA9F832': 1, '0x692e039CCb724373A212f0EF7285Ce860E988Eb5': 1, 
'0x5fb6f3A4BE9F595C304f5458fe8E35b5ff55C728': 1, '0xb5D695193FC25e9b2E3588F9A45C77aE09D88DEF': 1, 
'0xC0F0DC02338Df1dEAF25f42117d21C7dD1765956': 1, '0x8d6B5AA8755FbD93dd02c1Fbebd7A5C4cB3c7E8C': 1, 
'0x2c668bC44CAB30788A67f2e5243Fca42a0B04667': 1, '0xF35232a826eE477e307b9998456b911Bad9509c1': 1, 
'0xDF1aa393D35EdB09E48D5d8f7dbdF82f9e3684ef': 1, '0x3d91Af11eaA234daF1FF1059C50e5d07d0465505': 1, 
'0x9FEF46c2e08aA0627f03B8402000ddfC8fbd42Af': 1, '0x7990E3d38279931BE8f396B5dAc50F0765AD9f9f': 1, 
'0x6465Ff845BC571Ad991454A3E6CfE3790d369cD2': 1, '0x8bf04aF186A7Ac0078f32467e4A8cC57D8CA848d': 1, 
'0x8e9Ce4016C935fA612FDC40bD8b9C662b4517f7F': 1, '0x11d5F45239a2833a0a95596B1317A36Cb04b5268': 1, 
'0x651A7B585bcD4F047ea09c117f4Ae82DA58f5650': 1, '0x18e41bb2205e0d87cE94474411d49c035c15B062': 1, 
'0xFa485828fA7984dca8cea54Ecd7B9877b9f510e0': 1, '0x2218627c41F03A0c00dbF07514383B331f86A295': 1, 
'0xA5e05690757ED922500b4A5B3232210b7C8B5d09': 1, '0x8eb8a05960dB5793BB4521fCE7A2fF0fF5a05649': 1, 
'0x9246f1C4f24868E678Fad180a0859392f8A4791d': 1, '0x45dF28a209E2B4Fca5C6d14b6048e66C0133fc99': 1, 
'0x9060Cc7200BD2Aa6f7a68E8D5CC57BCc12B93853': 1, '0xc992a9F75Fc162B91a481EEf9aeC47465218C91A': 1, 
'0x84996fa06f857Dc6F12c352E90aAd6849F25ff0D': 1, '0x92B0815C439BA02339D32f44E1cFD5F5d1E4883C': 1, 
'0xec1BDDec1d5F64E6072a3Eee0274423B17Ec0A60': 1, '0xb013B41BDEF3FeD6CdE651E9f2Bc2fFD2238BAd4': 1, 
'0xC21969c23a264412C791494EF8721e4A0429dA81': 1, '0x65E36861cBC102560055Ac5273d266bccb22cBB9': 1, 
'0x14cfbD1D60684F32B5B3466829D5760384618c81': 1, '0x773fd91449CF5dE986d9129F28AAE224AFADd098': 1, 
'0xcf893845C90Ede75106Bbcd402EFC792F6C5b4BF': 1, '0x5111817277151611310ccd2aa2873ff0081F316f': 1, 
'0x4680B01D48f107928Dc75C3Ae5C8296D8cB0b5f7': 1, '0x1bc354C79a3Ec66866C349bb2F64F4DF153e9428': 1, 
'0x7E37d1400118126960a9739B7Fa9F1B3663c9e6e': 1, '0x8e827814d5d86bE1dc648A2E5fe9ab4872046aBD': 1, 
'0xA9f4DEec01598c34509B1A41c0323d290582E27E': 1, '0xb1305C6B59634E6a9E3E945471695F90e5399434': 1, 
'0xAB8Dc8012A783a96a77d7f6FAff453Ba99838fCC': 1, '0xc3105F88C6C1aC83b48200A89a4D99a681e165C8': 1, 
'0xE6f2B1f78C44db1381Da77B28d4B49eF349a93c5': 1, '0x7598047138307F52FCA61fCE6E489c2769C0Acd6': 1, 
'0x90d26fEC45754a9491535a7A4c9848bFb7ca1cD3': 1, '0x96E52c341f5E7612012Fe2056CA32C49E430Ef8D': 1, 
'0xdd330c70b3Bf5A90dcA873b0d4c9F7A778275979': 1, '0x7C5d0950584F961f5c1054c88a71B01207Bf9CB7': 1, 
'0x0d2DFfDAAA8cebc8a571f72cee303528f908d090': 1, '0xD2aF4791EDe5c94d36DB056b3a5679A92FB7B0E3': 1, 
'0xb1D3003e8Ef4Cd5abb98CbE7162eB42C7C36cdf4': 1, '0x1376BfDF9c7bF1F76de51539d403Bf4FedCaB245': 1, 
'0x4D3c5cF298eE549978057674e8efcF3E833369A2': 1, '0x0CFd800dda45Deab1e7A03f5B8b4C9E0c1b659Bb': 1, 
'0x2bF7c93d750a1033409ca452F5C0aFE6c4126311': 1, '0x9c69e7FCe961FD837F99c808aD75ED39a2c549Cb': 1, 
'0x10630c8130e44eD22D30d0A05488a10B44797a93': 1, '0xa351B3117e76F1810c5857A68907aC8FCe2B7d20': 1, 
'0xae72F470Da5446005c756B08D3e916f7EA8E9B72': 1, '0x75224e800636c3D397bADb4D7c544e09aDDd8E0A': 1, 
'0xD5a0b399C63e2cE0E77DD32d81D8531a2b9eE6ec': 1, '0x89d492909b28D2a51d26D03a735Bb180c0dc9F43': 1, 
'0x61D54e6F966F04Eb5889C64cB771CB01AC9C9032': 1, '0x6E4a215aa1d3372B81aA89637484Da8aFc900F90': 1, 
'0x679acFA49c88142307576581d79F91c56FD60A6f': 1, '0xa166e10e3966367235EB074AED1CC09E546a2092': 1, 
'0x716b90A806501AA32632B3d833f131fa592E27DC': 1, '0xd62C207e0691fc900b802c24211e28e6955E6227': 1, 
'0xb745EeDa2dB353a3E649A3774Fa759533CAf49F8': 1, '0x224a02dc5ADb3d2509dEe5b1190D75945D8442a1': 1, 
'0xc612Bda4A16C9DD2054E23e0bb5f16B8b073271D': 1, '0x359B0ceb2daBcBB6588645de3B480c8203aa5b76': 1, 
'0xAc47224B08949a5F585FEEB8Dd45c71801716136': 1, '0x693dd24191c062F8f453029162C64CB63E1F1027': 1, 
'0x901D258E7E478731254F7312A7c9f0B0d5851102': 1, '0x2F8ef05D6AAAe98Af0D10Ef4Cec24750fb819Ce2': 1, 
'0x4233A66cb9950eeef0FfFeF7488C6da562AEe855': 1, '0xbefcF37A1a9658eAE00806Da72a85E971fc8f454': 1, 
'0x4B7597C6D2DE8c9CF1A6468Cdd45Dd0044fA277e': 1, '0x4334CdDDb5c8432fb0a6F4FFe09D96F0A3c74254': 1, 
'0x104cd3fB79B0DFd538EF74eaDa94474E68206d3D': 1, '0x748A2f2d0956d66bD0312B0496856F979f673439': 1, 
'0xa2DE30D3BF69d3fc6864eA4db92276B8378f67BF': 1, '0x153695e57A1f47918A93a484Fa1CBB251bE9DE07': 1, 
'0x44F48B8C4ba9Cf527E55a24d1411a96D2E37ff7b': 1, '0x488Cb2cE2C8B8E8dfEf4ce0EAb4BEc3F20b1347E': 1, 
'0x168FbA9EFF10DE68809bcF2FD5A8ce20af2fbB3c': 1})
```
