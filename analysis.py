from collections import Counter
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# max bid isn't always used (eg, bid gets in too late); 90% is a rough empirical correction
BID2REWARD = 0.9
"""
===QUESTIONS TO ADDRESS FOR BOUNTY==
Detail level
✓1 For each MEV-boost block, check if an acceptable fee recipient was used
✓2 For each vanilla block, calculate how much was lost by not using MEV-boost
    See results/recipient_losses_vanilla.csv

High level
✓3 Losses due to wrong fee recipient
  3a Total ETH
  3b ETH per period
  3c Effect on APR
✓4 Losses due to not using MEV-boost
  4a Total ETH
  4b ETH per period
  4c Effect on APR
✓5 Distribution of MEV-boost bids for
  5a All block
  5b All RP blocks
  5c :star: All RP blocks that use MEV-boost w/correct fee recipient
  5d :star: All RP blocks that use MEV-boost w/wrong fee recipient
  5e :star: All vanilla RP blocks
"""


def wei2eth(wei_str):
    try:
        return int(wei_str) / 1e18
    except ValueError:
        return np.nan


def slot2timestamp(slot):
    return 1606824023 + 12 * slot


def get_rethdict(start_slot, end_slot):
    start_time = slot2timestamp(start_slot)
    end_time = slot2timestamp(end_slot)
    start_eth, start_reth, end_eth, end_reth = 0, 0, 0, 0

    with open('./data/balances.jsonl', 'r') as f:
        ls = [json.loads(line) for line in f]

    timediff = 999999999
    for _block, totalETH, _stakingEth, rethSupply, time in ls:
        time = int(time, 16)
        newtimediff = abs(time - start_time)
        if newtimediff < timediff:
            start_eth = int(totalETH, 16)
            start_reth = int(rethSupply, 16)
            timediff = newtimediff
        if time > start_time:
            break

    timediff = 999999999
    for _block, totalETH, _stakingEth, rethSupply, time in ls:
        time = int(time, 16)
        newtimediff = abs(time - end_time)
        if newtimediff < timediff:
            end_eth = int(totalETH, 16)
            end_reth = int(rethSupply, 16)
            timediff = newtimediff
        if time > end_time:
            break

    years = (end_time - start_time) / (60 * 60 * 24 * 365.25)
    return {
        'start_eth': wei2eth(start_eth),
        'start_reth': wei2eth(start_reth),
        'end_eth': wei2eth(end_eth),
        'end_reth': wei2eth(end_reth),
        'years': years,
    }


def rethdict2apy(d):
    return 100 * ((d['end_eth'] / d['end_reth']) - (d['start_eth'] / d['start_reth'])) / d['years']


def fix_bloxroute_missing_bids(df):
    ct = 0
    for ind, row in df.iterrows():
        missing_bid = np.isnan(row['max_bid']) and ~np.isnan(row['mev_reward'])
        missing_winning_bid = (~np.isnan(row['max_bid']) and ~np.isnan(row['mev_reward'])
                               and row['max_bid'] < row['mev_reward'])
        if missing_bid or missing_winning_bid:
            try:
                assert row['mev_reward_relay'] in ('bloXroute Max Profit', 'bloXroute Regulated')
            except AssertionError:
                print('WARNING: missing bid other than bloxroute')
                print(row)
            ct += 1
            df.loc[ind, 'max_bid'] = row['mev_reward'] / BID2REWARD
    print(f'Filled in proxy bloxroute max_bids for {ct} slots')
    return df


def recipient_losses_mevboost(df, total_weeks, rethdict):
    df_rp_mevboost = df[~df['is_vanilla'] & df['is_rocketpool']].copy()
    wrong_df = df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == False].copy()
    num_wrong = len(wrong_df)
    num_right = len(df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == True])
    num = len(df_rp_mevboost)
    assert num == num_wrong + num_right
    wrong_df.insert(0, 'lost_eth', wrong_df['mev_reward'] * wrong_df['reth_portion'])
    wrong_df.to_csv('./results/recipient_losses.csv')

    nolossd = rethdict.copy()
    nolossd['end_eth'] += sum(wrong_df['lost_eth'])

    print('\n=== MEV-Boost Recipient losses  (see results/recipient_losses.csv) ===')
    print(f'1: {num_wrong} of {num} MEV-boost slots used wrong fee recipient')
    print(f'3a: {sum(wrong_df["lost_eth"]):0.3f} total ETH lost due to wrong fee recipient')
    print(f'3b: {sum(wrong_df["lost_eth"])/total_weeks:0.3f} ETH lost per week')
    print(f'3c: APY was {rethdict2apy(rethdict):0.3f}% '
          f'when it should have been {rethdict2apy(nolossd):0.3f}%')
    print(f' aka, a {100*(1-rethdict2apy(rethdict)/rethdict2apy(nolossd)):0.2f}% performance hit')

    issue_nodes = df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == False]['node_address']
    return Counter(issue_nodes)


def vanilla_losses(df, total_weeks, rethdict):
    df_temp = df.copy()
    df_temp['proxy_max_bid'] = df_temp['max_bid'].rolling(7, center=True, min_periods=1).mean()
    df_rp_vanilla = df_temp[df_temp['is_vanilla'] & df_temp['is_rocketpool']]

    # make 3 empty columns
    df_rp_vanilla.insert(0, 'lost_eth_bad_recipient', [np.nan] * len(df_rp_vanilla))
    df_rp_vanilla.insert(0, 'lost_eth_nobid_avgestimate', [np.nan] * len(df_rp_vanilla))
    df_rp_vanilla.insert(0, 'lost_eth_nobid_neighborestimate', [np.nan] * len(df_rp_vanilla))
    df_rp_vanilla.insert(0, 'lost_eth_bid_estimate', [np.nan] * len(df_rp_vanilla))

    known_vanilla = df_rp_vanilla[~df_rp_vanilla['max_bid'].isna()].copy()
    df_rp_vanilla.loc[~df_rp_vanilla['max_bid'].isna(), 'lost_eth_bid_estimate'] = (
        known_vanilla['max_bid'] * BID2REWARD -
        known_vanilla['priority_fees']) * known_vanilla['reth_portion']

    unknown_vanilla = df_rp_vanilla[df_rp_vanilla['max_bid'].isna()].copy()
    df_rp_vanilla.loc[df_rp_vanilla['max_bid'].isna(), 'lost_eth_nobid_neighborestimate'] = (
        unknown_vanilla['proxy_max_bid'] * BID2REWARD -
        unknown_vanilla['priority_fees']) * unknown_vanilla['reth_portion']
    df_rp_vanilla.loc[df_rp_vanilla['max_bid'].isna(), 'lost_eth_nobid_avgestimate'] = (
        known_vanilla['max_bid'].mean() * BID2REWARD -
        unknown_vanilla['priority_fees']) * unknown_vanilla['reth_portion']

    # for bad recipient, we don't get to subtract the prio fee component
    for ind, row in df_rp_vanilla.iterrows():
        if row['correct_fee_recipient']:
            continue
        worst_case = np.nanmax([
            row['lost_eth_nobid_avgestimate'],
            row['lost_eth_nobid_neighborestimate'],
            row['lost_eth_bid_estimate'],
        ]) + row['priority_fees'] * row['reth_portion']
        # set this column and clear the others
        df_rp_vanilla.at[ind, 'lost_eth_bad_recipient'] = worst_case
        df_rp_vanilla.at[ind, 'lost_eth_bid_estimate'] = np.nan
        df_rp_vanilla.at[ind, 'lost_eth_nobid_avgestimate'] = np.nan
        df_rp_vanilla.at[ind, 'lost_eth_nobid_neighborestimate'] = np.nan

    df_rp_vanilla.to_csv('./results/vanilla_losses.csv')
    # note that lost_eth is a best guess on what an mev relay "should" have given us, but it's not
    # an actual measured value; as a result, we can even have a "negative" loss.

    lost_eth = df_rp_vanilla["lost_eth_bad_recipient"].sum()
    nolossd = rethdict.copy()
    nolossd['end_eth'] += lost_eth
    n_bad_rcpt = sum(~df_rp_vanilla["lost_eth_bad_recipient"].isna())

    print('\n=== Vanilla Recipient losses (see results/vanilla_losses.csv) ===')
    print(f' {n_bad_rcpt} of {len(df_rp_vanilla)} vanilla slots used wrong fee recipient (see '
          f'results/recipient_losses_vanilla.csv)')
    print(f'~{lost_eth:0.3f} total ETH lost due to wrong fee recipient')
    print(f'~{lost_eth/total_weeks:0.3f} ETH lost per week')
    print(f' APY was ~{rethdict2apy(rethdict):0.3f}% '
          f'when it should have been {rethdict2apy(nolossd):0.3f}%')
    print(f' aka, a {100*(1-rethdict2apy(rethdict)/rethdict2apy(nolossd)):0.2f}% performance hit')
    print("NB: We take a stab at vanilla losses using 90% of max_bid or sum of priority_fees, but "
          "it's possible for vanilla blocks without max_bid to hide offchain fees")

    lost_eth_nonrecipient = (df_rp_vanilla['lost_eth_bid_estimate'].fillna(0) +
                             df_rp_vanilla['lost_eth_nobid_neighborestimate'].fillna(0))
    total_loss = lost_eth_nonrecipient.sum()
    nolossd = rethdict.copy()
    nolossd['end_eth'] += total_loss

    print('\n=== Non-recipient vanilla losses (see results/vanilla_losses.csv) ===')
    print(f'There were {len(df_rp_vanilla) - n_bad_rcpt} vanilla RP blocks w/correct recipient')
    print(f'  {sum(~df_rp_vanilla["lost_eth_bid_estimate"].isna())} had bids; we can get ~loss')
    print(f"  {sum(~df_rp_vanilla['lost_eth_nobid_neighborestimate'].isna())} had no bid; "
          f"we'll use nearby bids as a guess")
    print(f'4a: ~{total_loss:0.3f} ETH lost due to not using relays (or theft)')
    temp = [f'{x:0.02f}' for x in lost_eth_nonrecipient.sort_values(ascending=False)[:5]]
    print(f'  Top 5 losses: {", ".join(temp)}')
    print(f'4b: ~{total_loss / total_weeks:0.3f} ETH lost per week')
    print(f'4c: APY was {rethdict2apy(rethdict):0.3f}% '
          f'when it could have been ~{rethdict2apy(nolossd):0.3f}%')
    print(f' aka, a {100*(1-rethdict2apy(rethdict)/rethdict2apy(nolossd)):0.2f}% performance hit')

    print(f"\nSanity checking 2 ways of estimating the unknown loss: "
          f"{df_rp_vanilla['lost_eth_nobid_neighborestimate'].sum():0.3f} "
          f"vs {df_rp_vanilla['lost_eth_nobid_avgestimate'].sum():0.3f}")
    print(" if first method is much higher, that means we're seeing vanilla block more often than"
          " expected during periods that tend to have high max bids, which is a yellow flag")

    rcpt_nodes = df_rp_vanilla.loc[df_rp_vanilla['correct_fee_recipient'], 'node_address']
    nonrcpt_nodes = df_rp_vanilla.loc[df_rp_vanilla['correct_fee_recipient'], 'node_address']
    return Counter(rcpt_nodes), Counter(nonrcpt_nodes)


def get_sf(ls):
    ls = sorted(ls)
    x, y_sf = [0], [1]

    for val in ls:
        x.append(val)
        y_sf.append(y_sf[-1] - 1 / len(ls))

    return x, y_sf


def distribution_plots(df):
    # note - in these plots, we only assess when there's a max bid; a validator that never
    # registered with relays (ie, always vanilla) would not show up in them at all
    unplotted_df = df[df['max_bid'].isna() & df['is_rocketpool']]
    unplotted_df.to_csv('./results/unplotted_rp_slots.csv')

    df = df[~df['max_bid'].isna()]
    df_rp = df[df['is_rocketpool']]
    df_rp_vanilla = df_rp[df_rp['is_vanilla']]
    df_rp_mev = df_rp[~df_rp['is_vanilla'] & df_rp['correct_fee_recipient'] == True]
    df_rp_bad_recipient = df_rp[df_rp['correct_fee_recipient'] == False]
    df_nonrp = df[df['is_rocketpool'] == False]
    df_nonrp_vanilla = df_nonrp[df_nonrp['is_vanilla']]

    all_x, all_sf = get_sf(df['max_bid'])
    rp_x, rp_sf = get_sf(df_rp['max_bid'])
    rp_vanilla_x, rp_vanilla_sf = get_sf(df_rp_vanilla['max_bid'])
    rp_mev_x, rp_mev_sf = get_sf(df_rp_mev['max_bid'])
    df_rp_bad_recipient_x, df_rp_bad_recipient_sf = get_sf(df_rp_bad_recipient['max_bid'])
    nonrp_vanilla_x, nonrp_vanilla_sf = get_sf(df_nonrp_vanilla['max_bid'])

    # 5a/5b Global vs RP -- ideally these look extremely similar
    fig, ax = plt.subplots(1)
    ax.semilogy(all_x, all_sf, marker='.', label='All')
    ax.semilogy(rp_x, rp_sf, marker='.', label='RP')
    ax.legend()
    ax.set_xlabel('Bid (ETH)')
    ax.set_ylabel('SF (proportion of blocks with at least x axis bid)')
    fig.savefig('./results/global_vs_rp.png', bbox_inches='tight')
    ax.set_xscale('log')
    fig.savefig('./results/global_vs_rp_loglog.png', bbox_inches='tight')

    # 5c/5d/5e RP correct vs not
    # - If wrong recipient has higher probability for high bids, that is a very clear sign of theft
    # - If vanilla has higher probability for high bids, that is a sign of likely theft
    fig, ax = plt.subplots(1)
    ax.semilogy(rp_mev_x, rp_mev_sf, marker='.', label='RP - correct MEV boost')
    ax.semilogy(rp_vanilla_x, rp_vanilla_sf, marker='.', label='RP - vanilla')
    ax.semilogy(
        df_rp_bad_recipient_x, df_rp_bad_recipient_sf, marker='.', label='RP - wrong recipient')
    ax.legend()
    ax.set_xlabel('Bid (ETH)')
    ax.set_ylabel('SF (proportion of blocks with at least x axis bid)')
    fig.savefig('./results/rp_subcategories.png', bbox_inches='tight')
    ax.set_xscale('log')
    fig.savefig('./results/rp_subcategories_loglog.png', bbox_inches='tight')

    # yokem suggestion Vanilla Blocks - RP vs non
    fig, ax = plt.subplots(1)
    ax.semilogy(nonrp_vanilla_x, nonrp_vanilla_sf, marker='.', label='Vanilla - nonRP')
    ax.semilogy(rp_vanilla_x, rp_vanilla_sf, marker='.', label='Vanilla - RP')
    ax.legend()
    ax.set_xlabel('Bid (ETH)')
    ax.set_ylabel('SF (proportion of blocks with at least x axis bid)')
    fig.savefig('./results/vanilla_rp_vs_nonrp.png', bbox_inches='tight')
    ax.set_xscale('log')
    fig.savefig('./results/vanilla_rp_vs_nonrp_loglog.png', bbox_inches='tight')

    issue_nodes = unplotted_df['node_address']
    return Counter(issue_nodes)


def main():
    start_slot, end_slot = 0, 0

    p = 'rockettheft_slot-0-to-0.csv'
    df_ls = []
    for p in sorted(Path(r'./data').glob('*.csv')):
        if start_slot == 0:
            start_slot = int(p.name.split('-')[1])
        df_ls.append(
            pd.read_csv(
                p,
                converters={
                    'max_bid': wei2eth,
                    'mev_reward': wei2eth,
                    'priority_fees': wei2eth,
                    'avg_fee': wei2eth,
                    'eth_collat_ratio': wei2eth,  # (node capital + user capital) / node capital
                }))
    df = pd.concat(df_ls)

    end_slot = int(p.name.split('-')[3].split('.')[0])
    assert end_slot != 0  # maybe hits if there's no data
    slots = len(df)
    wks = (slots * 12) / (60 * 60 * 24 * 7)
    range_slots = end_slot - start_slot
    range_wks = (range_slots * 12) / (60 * 60 * 24 * 7)
    rethdict = get_rethdict(start_slot, end_slot)
    print(f'Analyzing {wks:0.1f} weeks of data ({slots} slots)')
    print(f' {100*slots/range_slots:0.1f}% of range; {range_wks:0.1f} weeks ({range_slots} slots)')
    print('')

    df = df[df['proposer_index'].notna()]  # get rid of slots without a block
    df['is_vanilla'] = df['mev_reward'].isna()  # make a convenience column
    try:
        assert ((sum(df['avg_fee'] > 0.2) + sum(df['avg_fee'] < 0.05)) == 0)  # sanity check
    except AssertionError:
        over20 = df[df['avg_fee'] > 0.2]
        if len(over20):
            print('WARNING: over 20%')
            print(over20)
        under5 = df[df['avg_fee'] < 0.05]
        if len(under5):
            print('ERROR: under 5%')
            print(under5)
    df['reth_portion'] = (1 - (df['avg_fee'])) * (1 - (1 / df['eth_collat_ratio']))
    df.set_index('slot', inplace=True)

    df = fix_bloxroute_missing_bids(df.copy())

    c_rcpt_mev = recipient_losses_mevboost(df.copy(), wks, rethdict.copy())
    c_rcpt_van, c_nonrcpt_van = vanilla_losses(df.copy(), wks, rethdict.copy())
    c_unplotted = distribution_plots(df.copy())

    print('\n=== RP issue counts by node address ===')
    print(f'🚩Wrong recipient used with MEV-boost: {c_rcpt_mev}')
    print(f'🚩Wrong recipient used with vanilla: {c_rcpt_van}')
    print(f'⚠ Vanilla blocks: {c_nonrcpt_van}')
    print(f'⚠ No max bid: {c_unplotted}')  # not registered w/relays? hard to differentiate theft


if __name__ == '__main__':
    main()

# Notes:
# - There was a bug based on using getMinipoolAt instead of getNodeMinipoolAt. There was also a bug
#   that counted prelaunch pools in the numerator when initializing fee distributor. These were
#   fixed in a hotfix executed 2022-11-10. This means the reth share we calculate may or may not be
#   right based on initialization and distribution details per node. Calling it "close enough" and
#   simply using what the contract returns despite knowing that may be slightly off for that period
# - MEV grace period ended at slot 5203679 (2022-11-24 05:35:39Z UTC); see
#   https://discord.com/channels/405159462932971535/405163979141545995/1044108182513012796

# TODO check if theres's a period where nimbus bug caused issues that we should exclude
#      that data; it might be May/June 2023
# stretch todo -- for specific losses, plot over time
# stretch todo -- identify NOs that toggle between vanilla an MEV?

# slot 7123730 is suspect -- it's a massive loss due to vanilla, and can't tell if there was a theft
