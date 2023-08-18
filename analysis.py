import matplotlib.pyplot as plt
import pandas as pd
"""
===QUESTIONS TO ADDRESS FOR BOUNTY==
Detail level
1 For each MEV-boost block, check if an acceptable fee recipient was used
2 For each vanilla block, calculate how much was lost by not using MEV-boost

High level
3 Losses due to wrong fee recipient
  3a Total ETH
  3b ETH per period
  3c Effect on APR
4 Losses due to not using MEV-boost
  4a Total ETH
  4b ETH per period
  4c Effect on APR
5 Distribution of MEV-boost bids for
  5a All block
  5b All RP blocks
  5c :star: All RP blocks that use MEV-boost w/correct fee recipient
  5d :star: All RP blocks that use MEV-boost w/wrong fee recipient
  5e :star: All vanilla RP blocks
"""


def wei2eth(wei):
    return wei / 1e18


def recipient_losses(df):
    df_rp_mevboost = df[~df['is_vanilla'] & df['proposer_is_rocketpool']]
    num_right = len(df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == True])
    num_wrong = len(df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == False])
    num = len(df_rp_mevboost)
    assert num == num_wrong + num_right
    lost_eth = wei2eth(
        df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == False]['mev_reward'])
    print('=== Recipient losses ===')
    print(f'1: {num_wrong} of {num} used the wrong fee recipient (see below)')
    print(lost_eth)  # eth lost per slot using wrong fee recipient
    print(f'\n3a: {sum(lost_eth)} total ETH lost due to wrong fee recipient')


def vanilla_losses(df):
    df_rp_vanilla = df[df['is_vanilla'] & df['proposer_is_rocketpool']]
    n = len(df_rp_vanilla)
    n_unknown = len(df_rp_vanilla[df_rp_vanilla['max_bid'] == 0])
    df_loss = wei2eth(df_rp_vanilla[df_rp_vanilla['max_bid'] != 0]['max_bid'])
    assert n == len(df_loss) + n_unknown

    print('=== Vanilla losses ===')
    print(f'There were {n} vanilla RP blocks')
    print(f"{n_unknown} of them had no bid, so we don't know what the loss would be")
    print(f'{len(df_loss)} had bids, so we can quantify the loss (see below)')
    print(df_loss)
    print(f'\n4a: {sum(df_loss)} total ETH lost due to not using relays')


def main():
    df = pd.read_csv('./data/mevtheft_slot-6000000-to-6004999.csv')
    df = df[df['max_bid'].notna()]
    df['is_vanilla'] = df['mev_reward'] == 0
    df.set_index('slot', inplace=True)

    recipient_losses(df)
    vanilla_losses(df)


if __name__ == '__main__':
    main()

# TODO
# - For per period calculations, will need to get period boundaries in here
# - For APR calculations, will need to get rETH exchange rate data
