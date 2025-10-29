const axios = require('axios');

async function checkData() {
  try {
    const JWT_TOKEN = require('fs').readFileSync('/tmp/staging2_jwt_token.txt', 'utf8').trim();
    
    // Check via Overview API which can access the database
    const response = await axios.get('http://52.66.199.215:5108/overview', {
      params: { date: '2025-10-27' },
      headers: { 'Authorization': `Bearer ${JWT_TOKEN}` }
    });
    
    console.log('Overview data for 2025-10-27:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

checkData();
