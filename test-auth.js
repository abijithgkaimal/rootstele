require('dotenv').config();
const axios = require('axios');
const env = require('./src/config/env');

async function testAuth() {
  const url = env.verifyEmployeeUrl;
  const token = process.env.ROOTMENTS_API_TOKEN;
  console.log("URL:", url);
  console.log("Token exists:", !!token);

  try {
    const response = await axios.post(
      url,
      { employeeId: "emp188", password: "dummy" },
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    console.log("Success! Status:", response.status);
    console.log("Data:", response.data);
  } catch (error) {
    console.error("Error occurred!");
    console.error("Message:", error.message);
    if (error.response) {
      console.error("Response Status:", error.response.status);
      console.error("Response Data:", error.response.data);
    }
  }
}

testAuth();
