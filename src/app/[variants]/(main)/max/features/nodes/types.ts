export type MaxNodeType =
  | 'actionNode'
  | 'botMessage'
  | 'httpRequestNode'
  | 'inputNode'
  | 'logicNode'
  | 'mediaNode';

export interface InlineButton {
  id: string;
  label: string;
  row?: number;
}

export interface BotMessageNodeData {
  buttons?: InlineButton[];
  contentType?: 'file' | 'image' | 'text';
  fileUrl?: string;
  imageUrl?: string;
  markdown?: boolean;
  onAddNext?: () => void;
  onChange?: (patch: Partial<FlowNodeData>) => void;
  text?: string;
}

export interface MediaNodeData {
  caption?: string;
  mediaType?: 'file' | 'image' | 'video';
  onChange?: (patch: Partial<FlowNodeData>) => void;
  url?: string;
}

export interface InputNodeData {
  onChange?: (patch: Partial<FlowNodeData>) => void;
  prompt?: string;
  variableName?: string;
}

export interface LogicNodeData {
  onChange?: (patch: Partial<FlowNodeData>) => void;
  operator?: 'contains' | 'eq' | 'neq';
  value?: string;
  variableName?: string;
}

export interface HttpRequestNodeData {
  body?: string;
  headers?: string;
  method?: 'GET' | 'POST';
  onChange?: (patch: Partial<FlowNodeData>) => void;
  url?: string;
}

export interface ActionNodeData {
  actionType?: 'human_takeover' | 'typing';
  onChange?: (patch: Partial<FlowNodeData>) => void;
}

export interface FlowNodeData
  extends
    BotMessageNodeData,
    MediaNodeData,
    InputNodeData,
    LogicNodeData,
    HttpRequestNodeData,
    ActionNodeData {
  kind?: MaxNodeType;
}
