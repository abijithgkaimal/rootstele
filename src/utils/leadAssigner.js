const User = require('../models/User');
const LeadMaster = require('../models/LeadMaster');

/**
 * Assigns an array of newly created lead IDs evenly to currently logged-in telecallers.
 * A telecaller is considered logged in if they logged in within the last 12 hours.
 * 
 * @param {Array<String>} leadIds - Array of MongoDB ObjectIds for new leads.
 */
const assignNewlySyncedLeads = async (leadIds) => {
  if (!leadIds || leadIds.length === 0) return;

  // Find users who have logged in within the last 12 hours
  const activeUsers = await User.find({ 
    lastLoginAt: { $gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    role: { $ne: 'admin' } // assuming admins don't get leads, adjust if needed
  }).sort({ lastLoginAt: -1 });

  if (activeUsers.length === 0) {
    console.log(`[LeadAssigner] No active telecallers found to assign ${leadIds.length} newly synced leads.`);
    return;
  }

  console.log(`[LeadAssigner] Distributing ${leadIds.length} leads among ${activeUsers.length} telecallers.`);

  const bulkOps = [];
  leadIds.forEach((id, index) => {
    const telecaller = activeUsers[index % activeUsers.length];
    bulkOps.push({
      updateOne: {
        filter: { _id: id },
        // Set both createdBy and updatedBy to the assigned telecaller
        update: { 
          $set: { 
            createdBy: telecaller.employeeId,
            updatedBy: telecaller.employeeId
          }
        }
      }
    });
  });

  await LeadMaster.bulkWrite(bulkOps, { ordered: false });
};

module.exports = { assignNewlySyncedLeads };
