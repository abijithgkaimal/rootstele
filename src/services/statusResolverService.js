const resolveManualLeadStatus = (payload) => {
  const { callStatus, call_status, markasFollowup, mark_as_followup, markasComplaint, mark_as_complaint } = payload;
  const mc = markasComplaint === true || markasComplaint === 'true' || mark_as_complaint === true || mark_as_complaint === 'true';
  const mf = markasFollowup === true || markasFollowup === 'true' || mark_as_followup === true || mark_as_followup === 'true';

  if (mc) return 'complaint';
  if (mf) return 'followup';

  const status = (callStatus || call_status || '').toLowerCase().trim();
  switch (status) {
    case 'connected':
    case 'not interested':
    case 'forwarded':
      return 'completed';
    case 'not connected':
    case 'interested':
      return 'followup';
    default:
      return 'new';
  }
};

const resolveBookingConfirmationStatus = (payload) => {
  // Priority 1: explicit telecaller flags (same logic as return leads)
  const markasComplaint = payload.markasComplaint === true || payload.markasComplaint === 'true';
  const markasFollowup = payload.markasFollowup === true || payload.markasFollowup === 'true';

  if (markasComplaint) return 'complaint';
  if (markasFollowup) return 'followup';

  // Priority 2: booking-specific business rules (billReceived / amountMismatch)
  const billReceived = (payload.billReceived || payload.billrecieved || '').toString().toLowerCase();
  const amountMismatch = payload.amountMismatch === true || payload.amountMismatch === 'true';

  if (billReceived === 'no') return 'complaint';
  if (amountMismatch) return 'complaint';

  // Default: call handled → completed
  return 'completed';
};

const resolveReturnLeadStatus = (payload) => {
  const markasComplaint = payload.markasComplaint === true || payload.markasComplaint === 'true';
  const markasFollowup = payload.markasFollowup === true || payload.markasFollowup === 'true';

  if (markasComplaint) return 'complaint';
  if (markasFollowup) return 'followup';

  return 'completed';
};

module.exports = {
  resolveManualLeadStatus,
  resolveBookingConfirmationStatus,
  resolveReturnLeadStatus,
};
