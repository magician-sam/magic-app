/** Preferences never record a payment or confirm a reservation. */
export const paymentPreferences = [
  {value:'undecided',label:'Decide with the team'},
  {value:'whish',label:'Whish Money'},
  {value:'on_arrival',label:'Pay on the spot'},
] as const;
export type PaymentPreference = typeof paymentPreferences[number]['value'];
export const venuePreferences = [
  {value:'undecided',label:'Not decided yet'},
  {value:'home',label:'At home'},
  {value:'venue',label:'At a venue'},
  {value:'find_venue',label:'Help me find a venue'},
] as const;
export type VenuePreference = typeof venuePreferences[number]['value'];
export const paymentPreferenceLabel = (value?: string) => paymentPreferences.find(option=>option.value===value)?.label ?? '';
export const venuePreferenceLabel = (value?: string) => venuePreferences.find(option=>option.value===value)?.label ?? '';
