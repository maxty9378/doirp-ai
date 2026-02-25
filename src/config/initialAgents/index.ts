import kamNewListing from './key-account-new-product-listing.json';
import supervisorTeamCoaching from './supervisor-team-coaching.json';
import tradingRepPriceObjection from './trading-rep-price-objection.json';

export interface InitialTrainingAgentPreset {
  avatar?: string;
  backgroundColor?: string;
  description?: string;
  initialUserMessage?: string;
  key: string;
  marketIdentifier?: string;
  model: string;
  openingMessage?: string;
  provider?: string;
  systemRole: string;
  title: string;
}

export const INITIAL_TRAINING_AGENT_PRESETS: InitialTrainingAgentPreset[] = [
  tradingRepPriceObjection,
  supervisorTeamCoaching,
  kamNewListing,
];
