import test from 'node:test';import assert from 'node:assert/strict';import {validateMap,validateVerdict}from '../logic.mjs';
const events=[{id:'e1'}],transcript=[{id:'t1',role:'user',text:'Rentals stay in operating expenses.'}];
const make=()=>({steps:[{title:'Rental',decision:'Opex',reason:'Rental treatment',guardrails:['Check ownership'],eventId:'e1',transcriptId:'t1',quote:'Rentals stay in operating expenses.'}]});
test('grounded map requires explicit confirmation',()=>assert.equal(validateMap(make(),events,transcript).confirmed,false));
test('rejects fabricated screen evidence',()=>{const m=make();m.steps[0].eventId='fake';assert.throws(()=>validateMap(m,events,transcript));});
test('rejects fabricated quote',()=>{const m=make();m.steps[0].quote='Anything above 5000 is capex';assert.throws(()=>validateMap(m,events,transcript));});
test('agent statement cannot masquerade as expert evidence',()=>assert.throws(()=>validateMap(make(),events,[{...transcript[0],role:'agent'}])));
test('tutor rejects malformed decision',()=>assert.throws(()=>validateVerdict({verdict:'sure',reason:'yes'})));
