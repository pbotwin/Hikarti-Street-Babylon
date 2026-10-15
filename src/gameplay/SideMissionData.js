/**
 * District errands use explicit interactions; walking past a marker never
 * completes one. What the giver hands her is carried for everyone to see
 * (`carry`, SideMissionSystem): the café order, the parcels she picks up,
 * Hana's watering can; Sora's camera comes out at each viewpoint. `hints`:
 * what a resident involved says before the errand has started.
 */
export const SIDE_MISSIONS = [
  {
    id: 'cafe-delivery', title: 'A little warmth', giver: 'aoi', giverName: 'Aoi',
    description: 'Take Aoi’s freshly packed café order to Emi in the market, then return to Aoi.',
    offer: 'Emi has been setting up the market all afternoon. Could you take her this café order? Here, it’s packed and still warm. She’s by the east stalls. Come back afterwards, I have a little thank-you for you.',
    thanks: 'You made her afternoon! A warm drink and a familiar face can change the whole day. Here’s your thank-you.',
    hints: { emi: 'I ordered a café set from Aoi this morning and still haven’t had a moment to fetch it. If you pass her place on Hikari Street, could you ask if it’s ready?' },
    reward: 60, color: '#ffd38b', kind: 'delivery', carry: 'order',
    objectives: [{ id: 'deliver-emi', npc: 'emi', label: 'Deliver the café order to Emi', action: 'Deliver café order', x: 18, z: 85 }],
  },
  {
    id: 'lost-parcels', title: 'Special delivery', giver: 'ren', giverName: 'Ren',
    description: 'Recover three parcels scattered around the market and garden, then bring them to Ren.',
    offer: 'A strap came loose on my delivery bike! Three parcels slipped off between the market and the garden. Look for the small wrapped boxes. Could you collect all three and bring them back?',
    thanks: 'All three, and the labels are still readable! You saved my delivery round. This is for your trouble.',
    reward: 90, color: '#ffd38b', kind: 'parcel', carry: 'parcels',
    objectives: [
      { id: 'parcel-west', label: 'West market parcel', action: 'Collect parcel', x: -28, z: 78 },
      { id: 'parcel-east', label: 'East market parcel', action: 'Collect parcel', x: 27, z: 94 },
      { id: 'parcel-garden', label: 'Garden path parcel', action: 'Collect parcel', x: -12, z: 118 },
    ],
  },
  {
    id: 'garden-care', title: 'Room to bloom', giver: 'hana', giverName: 'Hana',
    description: 'Water three thirsty planters in the northern garden, then tell Hana how they are doing.',
    offer: 'The sun has been lovely, but our little garden is thirsty. Take this watering can and give the three marked planters a drink. I’ll be here when you’re finished.',
    thanks: 'Look at those flowers! A little care goes a long way. Thank you for helping our garden grow.',
    reward: 75, color: '#ace7ac', kind: 'garden', carry: 'can',
    objectives: [
      { id: 'planter-entry', label: 'Garden entrance planter', action: 'Water flowers', x: 25, z: 115 },
      { id: 'planter-east', label: 'East garden planter', action: 'Water flowers', x: 30, z: 125 },
      { id: 'planter-north', label: 'North garden planter', action: 'Water flowers', x: 16, z: 130 },
    ],
  },
  {
    id: 'scenic-route', title: 'Postcards from Hikari', giver: 'sora', giverName: 'Sora',
    description: 'Frame a postcard at three scenic spots, then share the views with Sora.',
    offer: 'I’m making a little postcard collection of Hikari. Will you help? Take my spare camera, visit the three marked viewpoints and frame a shot at each one. There’s a quiet view beyond every busy street.',
    thanks: 'The market, the garden, the whole district, you found its best angles. These will make wonderful postcards!',
    reward: 80, color: '#ceb5ff', kind: 'vista', carry: 'camera',
    objectives: [
      { id: 'vista-market', label: 'West market view', action: 'Frame postcard', x: -30, z: 90 },
      { id: 'vista-garden', label: 'Northern garden view', action: 'Frame postcard', x: 0, z: 132 },
      { id: 'vista-east', label: 'East promenade view', action: 'Frame postcard', x: 30, z: 108 },
    ],
  },
];

export const NPC_FALLBACKS = {
  aoi: { name: 'Aoi', role: 'Café owner', x: -5.4, z: -2 },
  ren: { name: 'Ren', role: 'Bicycle courier', x: -6, z: 60 },
  emi: { name: 'Emi', role: 'Market regular', x: 18, z: 85 },
  sora: { name: 'Sora', role: 'Street photographer', x: -17, z: 88 },
  hana: { name: 'Hana', role: 'Community gardener', x: 18, z: 112 },
  kenji: { name: 'Kenji', role: 'Neighborhood guide', x: -22, z: 108 },
};

export const NPC_GREETINGS = {
  aoi: 'Take your time around Hikari. Ren is just north of the old street, and the market is a lovely place to meet everyone.',
  ren: 'The road runs right through the market to the garden. A bicycle makes a nice way to explore — just mind the pedestrians!',
  emi: 'There’s always something happening at the market. Sora is looking for beautiful views, and Hana is tending the garden up north.',
  sora: 'Look up from the pavement once in a while. Hikari has a way of surprising you.',
  hana: 'The garden is open to everyone. Follow the paths, enjoy the flowers, and stay as long as you like.',
  kenji: 'I know every little corner of this neighborhood. That path behind me leads into the garden — it’s my favorite place in the district.',
};

export function createMissionRecords() {
  return Object.fromEntries(SIDE_MISSIONS.map((mission) => [mission.id, {
    status: 'available', completed: [],
  }]));
}
