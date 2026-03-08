import type { NetworkNode, Edge, ModuleType } from '../store/workspaceStore';

export function inferShapes(nodes: NetworkNode[], edges: Edge[]): NetworkNode[] {
  // Build connectivity set: all node IDs that participate in at least one edge
  const connectedIds = new Set<string>();
  edges.forEach(e => {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  });

  // Deep clone nodes to update shapes + connectivity
  const updatedNodes: NetworkNode[] = nodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      outputShape: undefined,
      shapeError: false,
      connected: connectedIds.has(n.id),
    }
  }));

  const adjacencyList = new Map<string, string[]>();
  const reverseList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  updatedNodes.forEach(n => {
    adjacencyList.set(n.id, []);
    reverseList.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  edges.forEach(e => {
    if (adjacencyList.has(e.source) && inDegree.has(e.target)) {
      adjacencyList.get(e.source)!.push(e.target);
      reverseList.get(e.target)!.push(e.source);
      inDegree.set(e.target, inDegree.get(e.target)! + 1);
    }
  });

  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  const sortedNodeIds: string[] = [];
  while (queue.length > 0) {
    const currId = queue.shift()!;
    sortedNodeIds.push(currId);
    adjacencyList.get(currId)?.forEach(neighbor => {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    });
  }

  sortedNodeIds.forEach(nodeId => {
    const nodeIndex = updatedNodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) return;
    const node = updatedNodes[nodeIndex];
    const { type, params } = node.data;

    try {
      if (type === 'Input') {
        node.data.outputShape = params.shape || '[B, C, H, W]';
        return;
      }

      const sources = reverseList.get(nodeId) || [];
      if (sources.length === 0) {
        // Disconnected node, cannot infer
        return;
      }

      const inputShapes = sources.map(srcId => {
        const srcNode = updatedNodes.find(n => n.id === srcId);
        return srcNode?.data.outputShape;
      });

      if (inputShapes.some(s => !s)) {
        return; // Upstream incomplete
      }

      const shape = calculateLayerShape(type, params, inputShapes as string[]);
      node.data.outputShape = shape;
    } catch (err) {
      node.data.shapeError = true;
      node.data.outputShape = "Error: Dimension Mismatch";
    }
  });

  return updatedNodes;
}

function parseShape(shapeStr: string): (string | number)[] {
  const inner = shapeStr.replace(/[[\]]/g, '').split(',').map(s => s.trim());
  return inner.map(s => {
    const parsed = parseInt(s, 10);
    return isNaN(parsed) ? s : parsed;
  });
}

function formatShape(shapeArr: (string | number)[]): string {
  return `[${shapeArr.join(', ')}]`;
}

function calculateLayerShape(type: ModuleType, params: Record<string, any>, inputShapes: string[]): string {
  if (inputShapes.length === 0) throw new Error("No inputs");
  
  if (type === 'Concat') {
    const dimParam = params.dim !== undefined ? params.dim : 1;
    let totalDimShape = 0;
    const baseShape = parseShape(inputShapes[0]);
    const dim = dimParam < 0 ? baseShape.length + dimParam : dimParam;
    
    for (const inStr of inputShapes) {
      const parsed = parseShape(inStr);
      if (parsed.length !== baseShape.length) throw new Error("Concat rank mismatch");
      for (let i = 0; i < baseShape.length; i++) {
        if (i !== dim && baseShape[i] !== parsed[i]) throw new Error("Concat shape mismatch");
      }
      const val = parsed[dim];
      if (typeof val === 'number') totalDimShape += val;
      else totalDimShape = -1;
    }
    
    const outShape = [...baseShape];
    if (totalDimShape > 0) outShape[dim] = totalDimShape;
    else outShape[dim] = '...';
    return formatShape(outShape);
  }

  const inShape = parseShape(inputShapes[0]);

  // Spatial calculation helper
  const calcSpatial = (inDim: any, k: any, s: any, p: any, d: any = 1, transpose: boolean = false, outPad: any = 0) => {
    if (typeof inDim !== 'number') return inDim;
    if (transpose) {
      return (inDim - 1) * s - 2 * p + d * (k - 1) + outPad + 1;
    }
    return Math.floor((inDim + 2 * p - d * (k - 1) - 1) / s + 1);
  };

  const getKernelArgs = (count: number) => {
     const k = params.kernel_size ?? 3;
     const s = params.stride ?? 1;
     const p = params.padding ?? 0;
     const d = params.dilation ?? 1;
     const op = params.output_padding ?? 0;

     const toArr = (v: any) => {
        if (Array.isArray(v)) return v;
        if (typeof v === 'string' && v.startsWith('[')) return parseShape(v);
        return Array(count).fill(v);
     };

     return { k: toArr(k), s: toArr(s), p: toArr(p), d: toArr(d), op: toArr(op) };
  };

  switch (true) {
    case type.startsWith('ConvTranspose'): {
      const dim = type.endsWith('1d') ? 1 : type.endsWith('2d') ? 2 : 3;
      if (inShape.length !== dim + 2) throw new Error(`${type} expects ${dim + 2}D input`);
      const { k, s, p, d, op } = getKernelArgs(dim);
      const outC = params.out_channels || 64;
      const spatial = inShape.slice(2).map((v, i) => calcSpatial(v, k[i], s[i], p[i], d[i], true, op[i]));
      return formatShape([inShape[0], outC, ...spatial]);
    }
    case type.startsWith('Conv'): {
      const dim = type.endsWith('1d') ? 1 : type.endsWith('2d') ? 2 : 3;
      if (inShape.length !== dim + 2) throw new Error(`${type} expects ${dim + 2}D input`);
      const { k, s, p, d } = getKernelArgs(dim);
      const outC = params.out_channels || 64;
      const spatial = inShape.slice(2).map((v, i) => calcSpatial(v, k[i], s[i], p[i], d[i]));
      return formatShape([inShape[0], outC, ...spatial]);
    }
    case type.includes('Pool') && !type.includes('Adaptive'): {
      const dim = type.endsWith('1d') ? 1 : type.endsWith('2d') ? 2 : 3;
      if (inShape.length !== dim + 2) throw new Error(`${type} expects ${dim + 2}D input`);
      const { k, s, p, d } = getKernelArgs(dim);
      const spatial = inShape.slice(2).map((v, i) => calcSpatial(v, k[i], s[i], p[i], d[i]));
      return formatShape([inShape[0], inShape[1], ...spatial]);
    }
    case type.includes('AdaptiveAvgPool'): {
       const dim = type.endsWith('1d') ? 1 : type.endsWith('2d') ? 2 : 3;
       if (inShape.length !== dim + 2) throw new Error(`${type} expects ${dim + 2}D input`);
       const outSizeRaw = params.output_size ?? (dim === 1 ? 1 : Array(dim).fill(7));
       const outSize = Array.isArray(outSizeRaw) ? outSizeRaw : (typeof outSizeRaw === 'string' && outSizeRaw.startsWith('[') ? parseShape(outSizeRaw) : [outSizeRaw]);
       return formatShape([inShape[0], inShape[1], ...outSize]);
    }
    case type === 'Linear': {
      if (inShape.length < 2) throw new Error("Linear expects >= 2D input");
      const outFeatures = params.out_features || 10;
      const outShape = [...inShape];
      outShape[outShape.length - 1] = outFeatures;
      return formatShape(outShape);
    }
    case type === 'Bilinear': {
       // Assuming inputShapes[0] and [1] are the two inputs
       const outFeatures = params.out_features || 64;
       return formatShape([inShape[0], outFeatures]);
    }
    case type === 'Flatten': {
      const startDim = params.start_dim ?? 1;
      const endDim = params.end_dim ?? -1;
      const s = startDim < 0 ? inShape.length + startDim : startDim;
      const e = endDim < 0 ? inShape.length + endDim : endDim;
      
      const middle = inShape.slice(s, e + 1);
      let flattened: string | number = 1;
      for (const val of middle) {
        if (typeof val === 'number' && typeof flattened === 'number') flattened *= val;
        else flattened = '...';
      }
      return formatShape([...inShape.slice(0, s), flattened, ...inShape.slice(e + 1)]);
    }
    case type === 'Unflatten': {
       const dim = params.dim ?? 1;
       const unflattenedSizeRaw = params.unflattened_size ?? '[64, 7, 7]';
       const unflattenedSize = typeof unflattenedSizeRaw === 'string' && unflattenedSizeRaw.startsWith('[') ? parseShape(unflattenedSizeRaw) : [unflattenedSizeRaw];
       const outShape = [...inShape];
       outShape.splice(dim, 1, ...unflattenedSize);
       return formatShape(outShape);
    }
    case type === 'Upsample': {
       const sizeRaw = params.size;
       const scaleRaw = params.scale_factor;
       if (sizeRaw) {
          const size = typeof sizeRaw === 'string' && sizeRaw.startsWith('[') ? parseShape(sizeRaw) : [sizeRaw];
          return formatShape([inShape[0], inShape[1], ...size]);
       }
       if (scaleRaw) {
          const spatial = inShape.slice(2).map(v => typeof v === 'number' ? Math.floor(v * scaleRaw) : '...');
          return formatShape([inShape[0], inShape[1], ...spatial]);
       }
       return formatShape(inShape);
    }
    default:
      return formatShape(inShape);
  }
}
