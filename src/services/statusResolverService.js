const resolveManualLeadStatus = (payload) => {
  const { callStatus, markasFollowup, markasComplaint } = payload;
  const mf = !!markasFollowup;
  const mc = !!markasComplaint;

  if (mc) return 'complaint';
  if (mf) return 'followup';

  switch (callStatus) {
    case 'connected':
    case 'not interested':
    case 'forwarded':
      return 'completed';
    case 'not connected':
      return 'new';
    case 'interested':
      return 'followup';
    default:
      return 'new';
  }
};

const resolveBookingConfirmationStatus = (payload) => {
  const billReceived = (payload.billReceived || payload.billrecieved || '').toString().toLowerCase();
  const amountMismatch = payload.amountMismatch === true || payload.amountMismatch === 'true';

  if (billReceived === 'no') return 'complaint';
  if (amountMismatch) return 'complaint';
  if (billReceived === 'yes' && !amountMismatch) return 'completed';

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
