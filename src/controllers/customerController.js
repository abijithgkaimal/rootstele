const LeadMaster = require('../models/LeadMaster');
const customerService = require('../services/customerService');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const checkPhone = asyncHandler(async (req, res) => {
  const phone = req.query.phone;
  if (!phone) {
    return success(res, {
      exists: false,
      popupType: 'newLeadPopup',
      options: ['enquiry', 'booked'],
    });
  }

  const normalizedPhone = customerService.normalize(phone);
  if (!normalizedPhone) {
    return success(res, {
      exists: false,
      popupType: 'newLeadPopup',
      options: ['enquiry', 'booked'],
    });
  }

  const customer = await customerService.getCustomerByPhone(normalizedPhone);
  if (!customer) {
    return success(res, {
      exists: false,
      popupType: 'newLeadPopup',
      options: ['enquiry', 'booked'],
    });
  }

  let lead = null;
  if (customer.latestLeadId) {
    lead = await LeadMaster.findById(customer.latestLeadId).lean();
  }

  const popupType = customerService.computePopupType(
    customer.latestLeadStatus,
    customer.latestLeadType
  );

  return success(res, {
    exists: true,
    popupType,
    customer: {
      _id: customer._id,
      phone: customer.phone,
      name: customer.name,
      leadCount: customer.leadCount,
      latestLeadStatus: customer.latestLeadStatus,
      latestLeadType: customer.latestLeadType,
      latestStore: customer.latestStore,
    },
    lead,
  });
});

const getHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await customerService.getCustomerHistory(id);
  if (!result) {
    return res.status(404).json({ success: false, message: 'Customer not found' });
  }
  return success(res, result);
});

module.exports = { checkPhone, getHistory };
