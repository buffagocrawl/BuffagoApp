if (!__DEV__) throw new Error('Development fixtures only');
export class WingmanService {
  async run(input: { restaurantName?: string }) {
    if (input.restaurantName === 'QA Confidence Wings') return {
      success: true, decision: 'approved', decisionReason: 'approved',
      ai: {normalizedName:'QA Confidence Wings',confidence:.95,wingsProbability:.5,isRealRestaurant:true,verifiedPlace:true,locationStatus:'verified',wingEvidenceStatus:'supports'},
      place: {found:true,name:'QA Confidence Wings',address:'1 Fixture Lane',city:'Buffalo',state:'NY',lat:42.9,lng:-78.8},
    };
    return { success: false, userMessage: 'Local verification retry; no restaurant created.' };
  }
}
