// Builds classification/entity-layers.ts from the user's entity-layer-mappings.js
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(process.argv[2],'utf8').replace(/^export\s*\{[\s\S]*?\};/m,'');
const ctx={window:{},console:{log(){},error:(...a)=>{console.error('SRC ERROR',...a);}}};
vm.createContext(ctx); vm.runInContext(src+';this.R={ENTITY_TYPES,OSI_ENTITY_LAYER_MAP,OPS_ENTITY_LAYER_MAP,ABSTRACTION_ENTITIES,CONCEPTUAL_ENTITIES}',ctx);
const R=ctx.R;
const osi={}; for(const [k,v] of R.OSI_ENTITY_LAYER_MAP) osi[k]=v===-1?'ABSTRACT':'L'+v;
const ops={}; for(const [k,v] of R.OPS_ENTITY_LAYER_MAP) ops[k]=v;
const types=[...R.ENTITY_TYPES];
const miss=types.filter(t=>!osi[t]||!ops[t]); if(miss.some(t=>t!=='MissingFromTopology')) throw new Error('unmapped '+miss);
const row=(o)=>Object.keys(o).sort((a,b)=>a.toLowerCase()<b.toLowerCase()?-1:1).map(k=>`  ${/^[a-z][A-Za-z0-9]*$/.test(k)?k:JSON.stringify(k)}: '${o[k]}'`).join(',\n');
fs.writeFileSync(process.argv[3],`/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * GENERATED from entity-layer-mappings.js (unified entity layer mappings, ${types.length} entity types). Do not edit by hand:
 * correct a placement in LAYER_OVERRIDES (types-map.ts) instead, or regenerate from a newer mappings file.
 * Every entity type is in exactly one OSI layer and exactly one OPS layer, except MissingFromTopology: the source lists it
 * but assigns it to no layer (it marks a resource that is not in the topology), so it is left out and lands in Unclassified.
 */

export type OsiKey = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'ABSTRACT';
export type OpsKey = 'Business_User' | 'Application_Services' | 'Platform_Runtime' | 'Network_Fabric' | 'Physical_Infrastructure';

export const ENTITY_TYPES: string[] = ${JSON.stringify(types)};

/** entity type -> OSI layer (\`ABSTRACT\` is the module's Abstraction bucket above L7). */
export const OSI_LAYER_OF: Record<string, OsiKey> = {
${row(osi)}
};

/** entity type -> OPS layer. */
export const OPS_LAYER_OF: Record<string, OpsKey> = {
${row(ops)}
};
`);
console.log(types.length,'types; osi',Object.keys(osi).length,'ops',Object.keys(ops).length);
