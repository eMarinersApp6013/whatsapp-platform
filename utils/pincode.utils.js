/**
 * Map Indian pincodes to shipping zones using first 2 digits.
 *
 * Zones: North, South, East, West, NorthEast, Remote
 *
 * Based on India Post pincode allocation:
 *   1x = Delhi, Haryana, Punjab, HP, J&K (North)
 *   2x = UP, Uttarakhand (North)
 *   3x = Rajasthan, Gujarat (West)
 *   4x = Maharashtra, Goa (West)
 *   5x = Andhra Pradesh, Telangana, Karnataka (South)
 *   6x = Kerala, Tamil Nadu (South)
 *   7x = West Bengal, Odisha (East)
 *   8x = Bihar, Jharkhand, Assam, NE states (East/NorthEast)
 *   9x = Army Post Office / Remote
 */

const ZONE_MAP = {
  // North
  '10': 'North', '11': 'North', '12': 'North', '13': 'North', '14': 'North',
  '15': 'North', '16': 'North', '17': 'North', '18': 'North', '19': 'North',
  '20': 'North', '21': 'North', '22': 'North', '23': 'North', '24': 'North',
  '25': 'North', '26': 'North', '27': 'North', '28': 'North', '29': 'North',

  // West — Rajasthan
  '30': 'West', '31': 'West', '32': 'West', '33': 'West', '34': 'West',

  // West — Gujarat
  '35': 'West', '36': 'West', '37': 'West', '38': 'West', '39': 'West',

  // West — Maharashtra, Goa
  '40': 'West', '41': 'West', '42': 'West', '43': 'West', '44': 'West',
  '45': 'West', '46': 'West', '47': 'West',

  // West — MP, Chhattisgarh
  '48': 'West', '49': 'West',

  // South — AP, Telangana
  '50': 'South', '51': 'South', '52': 'South', '53': 'South',

  // South — Karnataka
  '54': 'South', '55': 'South', '56': 'South', '57': 'South', '58': 'South', '59': 'South',

  // South — Kerala
  '60': 'South', '67': 'South', '68': 'South', '69': 'South',

  // South — Tamil Nadu
  '61': 'South', '62': 'South', '63': 'South', '64': 'South',

  // South — Pondicherry
  '65': 'South', '66': 'South',

  // East — West Bengal
  '70': 'East', '71': 'East', '72': 'East', '73': 'East', '74': 'East',

  // East — Odisha
  '75': 'East', '76': 'East', '77': 'East',

  // NorthEast — Assam, NE states
  '78': 'NorthEast', '79': 'NorthEast',

  // East — Bihar, Jharkhand
  '80': 'East', '81': 'East', '82': 'East', '83': 'East', '84': 'East', '85': 'East', '86': 'East',

  // NorthEast — remaining NE
  '87': 'NorthEast', '88': 'NorthEast', '89': 'NorthEast',

  // Remote — APO, special
  '90': 'Remote', '91': 'Remote', '92': 'Remote', '93': 'Remote', '94': 'Remote',
  '95': 'Remote', '96': 'Remote', '97': 'Remote', '98': 'Remote', '99': 'Remote',
};

/**
 * Get shipping zone from a 6-digit Indian pincode.
 * @param {string|number} pincode
 * @returns {string} Zone name: North, South, East, West, NorthEast, or Remote
 */
function getZone(pincode) {
  const pin = String(pincode).trim();
  if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    return 'Remote';
  }
  const prefix = pin.substring(0, 2);
  return ZONE_MAP[prefix] || 'Remote';
}

/**
 * Calculate shipping rate based on zone and weight.
 * @param {object} rate - shipping_rates row for the zone
 * @param {number} weightKg - total weight in kg
 * @returns {number} shipping charge
 */
function calculateShipping(rate, weightKg) {
  if (!rate) return 0;
  const w = parseFloat(weightKg) || 0;
  if (w <= 0.5) return parseFloat(rate.rate_500g) || 0;
  if (w <= 1) return parseFloat(rate.rate_1kg) || 0;
  if (w <= 2) return parseFloat(rate.rate_2kg) || 0;
  // Above 2kg: rate_2kg + per_kg_extra for each additional kg
  const extraKg = Math.ceil(w - 2);
  return (parseFloat(rate.rate_2kg) || 0) + extraKg * (parseFloat(rate.per_kg_extra) || 0);
}

module.exports = { getZone, calculateShipping, ZONE_MAP };
