// 1. Import the Express tool
const express = require('express');

// 2. Create an instance of our server
const app = express();

// 3. Define a port number
const port = 3000;

// 4. Tell Express to serve all static files from the 'public' folder
// This is the new, important line!
app.use(express.static('public'));

// 5. Start the server
app.listen(port, () => {
  console.log(`Server is successfully running at http://localhost:${port}`);
});