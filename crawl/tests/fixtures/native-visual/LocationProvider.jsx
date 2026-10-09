import React from 'react';
import approvedSample from './approvedPhoto';
if (!__DEV__) throw new Error('Development fixtures only');
const value = { status: 'granted', coords: { latitude: 42.8864, longitude: -78.8784 }, askPermission: async () => {}, refreshPosition: async () => {} };
if (approvedSample) value.coords = { latitude: Number(approvedSample.restaurant.lat), longitude: Number(approvedSample.restaurant.lng) };
export const useLocation = () => value;
export const useLocationCtx = () => value;
export const useLocationState = () => value;
export default function LocationProvider({ children }) { return <>{children}</>; }
export const useLocationContext = () => value;
export const openLocationSettings = async () => {};
