import test from 'node:test';
import assert from 'node:assert/strict';
import { ratingSaveUserMessage } from '../lib/ratingErrors.js';

test('rating failures give recovery guidance without exposing raw database errors',()=>{
  assert.doesNotMatch(ratingSaveUserMessage({code:'23505',message:'duplicate key exposes internal rating_operations_pk'}),/23505|rating_operations|duplicate key/);
  assert.match(ratingSaveUserMessage({message:'authentication_required'}),/sign in again/);
  assert.match(ratingSaveUserMessage({message:'proximity_too_far'}),/location access/);
  assert.match(ratingSaveUserMessage({message:'Failed to fetch'}),/Check your connection/);
  assert.doesNotMatch(ratingSaveUserMessage(null),/already saved/);
});
