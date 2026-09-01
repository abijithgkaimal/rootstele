const cron = require('node-cron');
const LeadMaster = require('../models/LeadMaster');
const socketService = require('../services/socketService');

/**
 * Sweeps the database for due follow-ups and emits real-time alerts to assigned telecallers.
 */
const checkFollowupReminders = async () => {
  try {
    const now = new Date();
    const dueFollowups = await LeadMaster.find({
      leadStatus: 'followup',
      followupDate: { $lte: now },
      reminderSent: { $ne: true },
    })
      .select('_id phone customerName name store followupDate subCategory remarks updatedBy')
      .limit(500)
      .lean();

    if (!dueFollowups || dueFollowups.length === 0) {
      return { alerted: 0 };
    }

    console.log(`[FollowupScheduler] Found ${dueFollowups.length} due follow-up reminders.`);

    const alertedIds = [];

    for (const lead of dueFollowups) {
      const telecallerId = lead.updatedBy;
      if (telecallerId && telecallerId !== 'system') {
        socketService.emitToTelecaller(telecallerId, 'followup:reminder', {
          leadId: lead._id,
          customerName: lead.customerName || lead.name || 'Unknown',
          phone: lead.phone,
          store: lead.store,
          followupDate: lead.followupDate,
          remarks: lead.remarks,
          subCategory: lead.subCategory,
        });
      }
      alertedIds.push(lead._id);
    }

    // Flag all alerted leads as reminderSent = true to avoid repeated alerts
    if (alertedIds.length > 0) {
      await LeadMaster.updateMany(
        { _id: { $in: alertedIds } },
        { $set: { reminderSent: true } }
      );
    }

    return { alerted: alertedIds.length };
  } catch (err) {
    console.error('[FollowupScheduler] Error processing reminders:', err.message);
    return { error: err.message };
  }
};

/**
 * Initialize Followup Reminder Scheduler cron job (every 5 minutes).
 */
const initializeFollowupScheduler = () => {
  console.log('[FollowupScheduler] Initializing Followup Reminder Scheduler (every 5 minutes)...');

  cron.schedule('*/5 * * * *', async () => {
    await checkFollowupReminders();
  });

  // Run an immediate sweep on boot
  checkFollowupReminders().catch((err) => {
    console.error('[FollowupScheduler] Boot sweep failed:', err.message);
  });
};

module.exports = {
  initializeFollowupScheduler,
  checkFollowupReminders,
};
