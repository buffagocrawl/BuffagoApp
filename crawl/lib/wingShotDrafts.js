import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWingShotDraftStore } from './wingShotDraftStore.js';
export const wingShotDrafts = createWingShotDraftStore(AsyncStorage);
