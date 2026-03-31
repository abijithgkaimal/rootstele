const axios = require('axios');
const dayjs = require('dayjs');
const LeadMaster = require('../models/LeadMaster');
const customerService = require('./customerService');
const { normalize } = require('../utils/phoneNormalizer');
const env = require('../config/env');

const JOB_NAME = 'justDialSync';

/**
 * Sync JustDial leads from an external API.
 * Rules:
 *   - Duplicate check based on normalizedPhone.
 *   - If phone exists: update leadtype to 'justdial', keep status.
 *   - If phone does NOT exist: create new lead (status 'new', source 'justDialSync').
 */
const syncJustDialLeads = async ({ initial = false } = {}) => {
  const lookbackDays = initial ? 60 : 7;
  const dateFrom = dayjs().subtract(lookbackDays, 'day').format('YYYY-MM-DD');
  const dateTo = dayjs().format('YYYY-MM-DD');

  console.log(`[JustDialSync] Starting ${initial ? '60-day' : '7-day'} sync: ${dateFrom} → ${dateTo}`);

  try {
    const url = env.justDialApiUrl;
    // Note: Assuming API supports date filtering. If not, adjustment might be needed.
    const response = await axios.get(url, {
      params: { fromDate: dateFrom, toDate: dateTo },
      timeout: 60000
    });

    // Assume response contains: { data: [{ phone, name, callStatus, message, createdAt }, ...] }
    const leadsData = response?.data?.data || response?.data || [];
    if (!Array.isArray(leadsData) || !leadsData.length) {
      console.log(`[JustDialSync] No data fetched from API.`);
      return { totalLeads: 0 };
    }

    let updated = 0;
    let created = 0;
    const phonesToSync = new Set();

    for (const jdLead of leadsData) {
      const rawPhone = jdLead.phone || jdLead.phoneNo || '';
      const normPhone = normalize(rawPhone);
      if (!normPhone) continue;

      phonesToSync.add(normPhone);

      const existingLead = await LeadMaster.findOne({ normalizedPhone: normPhone });

      if (existingLead) {
        // CASE 1: Phone exists → Update leadtype only
        // As per requirement: DO NOT change leadStatus, createdAt, etc.
        await LeadMaster.updateOne(
          { _id: existingLead._id },
          { 
            $set: { 
              leadtype: 'justdial',
              updatedAt: new Date()
            }
          }
        );
        updated++;
      } else {
        // CASE 2: Phone does not exist → Create new lead
        await LeadMaster.create({
          phone: rawPhone,
          normalizedPhone: normPhone,
          customerName: jdLead.name || '',
          leadtype: 'justdial',
          leadStatus: 'new',
          source: 'justDialSync',
          callStatus: jdLead.callStatus || '',
          remarks: jdLead.message || '',
          createdAt: jdLead.createdAt ? new Date(jdLead.createdAt) : new Date(),
          updatedAt: new Date()
        });
        created++;
      }
    }

    console.log(`[JustDialSync] Sync complete. Created: ${created}, Updated: ${updated}`);

    // Recompute customer mapping if needed
    for (const phone of phonesToSync) {
      customerService.recomputeCustomerState(phone).catch(() => { });
    }

    return { totalLeads: created + updated, created, updated };
  } catch (err) {
    console.error(`[JustDialSync] Fatal error:`, err.message);
    throw err;
  }
};

module.exports = { syncJustDialLeads };
