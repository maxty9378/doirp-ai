import hnBudgetWall from './hn-budget-wall.json';
import hnCourseChange from './hn-course-change.json';
import hnToxicStar from './hn-toxic-star.json';
import kamNewListing from './key-account-new-product-listing.json';
import supervisorTeamCoaching from './supervisor-team-coaching.json';
import tradingRepPriceObjection from './trading-rep-price-objection.json';
export interface InitialTrainingAgentPreset {
  avatar?: string;
  backgroundColor?: string;
  description?: string;
  /** Цели тренажера (буллиты) */
  goals?: string[];
  initialUserMessage?: string;
  key: string;
  marketIdentifier?: string;
  model: string;
  openingMessage?: string;
  provider?: string;
  /** Контекст сценария (легенда) для голосового тренажёра */
  scenario_context?: string;
  systemRole: string;
  title: string;
  /** Роль пользователя (кто вы в сценарии) */
  user_role?: string;
}

export const HARD_NEGOTIATIONS_PRESETS: InitialTrainingAgentPreset[] = [
  hnBudgetWall,
  hnToxicStar,
  hnCourseChange,
];

export const INITIAL_TRAINING_AGENT_PRESETS: InitialTrainingAgentPreset[] = [
  tradingRepPriceObjection,
  supervisorTeamCoaching,
  kamNewListing,
];

/** Preset for voice-call "Полевой боец: Дорого" (price objection trainer) */
export const TRADING_REP_PRICE_OBJECTION_PRESET = tradingRepPriceObjection;

/** Map agentId (marketIdentifier) -> preset for voice-call API */
export const VOICE_CALL_PRESETS: Record<string, InitialTrainingAgentPreset> = {
  'training-tp-price-objection': tradingRepPriceObjection,
};
