import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

const allowedNodeTypes = new Set([
  'actionNode',
  'botMessage',
  'httpRequestNode',
  'input',
  'inputNode',
  'logicNode',
  'mediaNode',
]);

const normalizeFlow = (payload: unknown) => {
  const data = (payload || {}) as {
    edges?: Array<{
      id?: string;
      source?: string;
      sourceHandle?: string;
      target?: string;
      targetHandle?: string;
      type?: string;
    }>;
    nodes?: Array<{
      data?: Record<string, unknown>;
      id?: string;
      position?: { x?: number; y?: number };
      type?: string;
    }>;
  };

  const nodes = (data.nodes || [])
    .filter((node) => Boolean(node?.id && node?.type && allowedNodeTypes.has(node.type)))
    .map((node) => ({
      data: node.data || {},
      id: String(node.id),
      position: {
        x: Number(node.position?.x || 0),
        y: Number(node.position?.y || 0),
      },
      type: String(node.type),
    }));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (data.edges || [])
    .filter((edge) => Boolean(edge?.source && edge?.target))
    .filter((edge) => nodeIds.has(String(edge.source)) && nodeIds.has(String(edge.target)))
    .map((edge, index) => ({
      id: edge.id || `e-${index}-${edge.source}-${edge.target}`,
      source: String(edge.source),
      sourceHandle: edge.sourceHandle,
      target: String(edge.target),
      targetHandle: edge.targetHandle,
      type: edge.type || 'smoothstep',
    }));

  return { edges, nodes };
};

export const GET = async () => {
  try {
    const filePath = path.join(process.cwd(), 'flow.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const flow = JSON.parse(raw);
    return NextResponse.json({ flow, status: 'ok' });
  } catch {
    return NextResponse.json({ flow: null, status: 'ok' });
  }
};

export const POST = async (req: Request) => {
  try {
    const data = await req.json();
    const normalized = normalizeFlow(data);

    const filePath = path.join(process.cwd(), 'flow.json');
    await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf-8');

    return NextResponse.json({ message: 'Flow saved successfully', status: 'success' });
  } catch (error) {
    console.error('Error saving flow:', error);
    return NextResponse.json({ message: 'Failed to save flow', status: 'error' }, { status: 500 });
  }
};
