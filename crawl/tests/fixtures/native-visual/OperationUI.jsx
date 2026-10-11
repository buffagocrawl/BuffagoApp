import React from 'react';
import { Image } from 'react-native';
import { WingShotImage as ProductionWingShotImage } from '../../../components/ui/OperationUI';
export * from '../../../components/ui/OperationUI';
if (!__DEV__) throw new Error('Development fixtures only');
// Local synthetic gallery images use the existing loopback fault server.
// Production keeps its HTTPS-only image rule and never resolves this module.
export function WingShotImage(props) {
  if (props.approved && /^http:\/\/127\.0\.0\.1:8084\/image\//.test(props.uri || '')) {
    return <Image source={{ uri: props.uri }} accessibilityLabel="Approved Wing Shot, synthetic QA fixture" resizeMode="cover" style={[{ width: '100%', height: 180 }, props.style]} />;
  }
  return <ProductionWingShotImage {...props} />;
}
