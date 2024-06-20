require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('querystring');
const cors = require('cors'); 
const path = require('path');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const app = express();

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SCOPE = process.env.SCOPE;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cors());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
}));

app.get('/', (req, res) => {
    res.render('home');
});

// Đường dẫn để bắt đầu quy trình xác thực Google
app.get('/auth/google', (req, res) => {
    const params = {
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPE,
    };
    const authUrl = `${process.env.API_OAUTH}?${qs.stringify(params)}`;
    res.redirect(authUrl);
});

// Đường dẫn callback sau khi người dùng xác thực
app.get('/auth/google/callback', async (req, res) => {
    const code = req.query.code;
    const tokenParams = {
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
    };

    try {
        const tokenResponse = await axios.post(process.env.API_TOKEN, qs.stringify(tokenParams), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        req.session.access_token = tokenResponse.data.access_token;
        res.redirect('/enter-link');
    } catch (error) {
        console.error('Error exchanging code for tokens:', error.message);
        res.status(500).send('Failed to authenticate');
    }
});


// Hàm để trích xuất fileId từ URL Google Docs
function extractFileId(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

app.get('/get-comments', async (req, res) => {
    console.log(req.session.access_token);
    if (!req.session.access_token) {
        return res.redirect('/auth/google');
    }

    const fileUrls = req.query.fileUrls;
    if (!fileUrls) {
        return res.status(400).send('No Google Docs URLs provided.');
    }

    const urls = fileUrls.split('\n').map(url => url.trim()).filter(url => url !== ''); // Chia tách các URL bằng dấu xuống dòng và bỏ qua dòng trống

    if (urls.length === 0) {
        return res.status(400).send('Invalid Google Docs URLs.');
    }

    const results = { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0 };
    const tagRegex = /\[F([1-5])\]/;
    const allDocuments = [];

    try {
        for (const url of urls) {
            const fileId = extractFileId(url);
            if (fileId) {
                // Lấy thông tin chi tiết của tài liệu
                const fileDetailsResponse = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`, {
                    headers: {
                        Authorization: `Bearer ${req.session.access_token}`
                    }
                });

                const fileName = fileDetailsResponse.data.name;

                // Đăng ký webhook theo dõi tài liệu này
                // await watchFile(fileId, req.session.access_token);

                // Lấy nhận xét từ tài liệu
                const commentsResponse = await axios.get(`https://www.googleapis.com/drive/v2/files/${fileId}/comments`, {
                    headers: {
                        Authorization: `Bearer ${req.session.access_token}`
                    }
                });

                const comments = commentsResponse.data.items;

                allDocuments.push({ fileName, comments });

                const commentContents = comments.map(comment => comment.content);
                commentContents.forEach(content => {
                    const match = content.match(tagRegex);
                    if (match) {
                        const tagKey = match[0].substring(2, 3);
                        if (results.hasOwnProperty(`F${tagKey}`)) {
                            results[`F${tagKey}`]++;
                        }
                    }
                });
            } else {
                console.warn(`Invalid Google Docs URL: ${url}`);
            }
        }

        const sum = Object.values(results).reduce((acc, currentValue) => acc + currentValue, 0);
        res.render('index', { results, allDocuments, sum });
    } catch (error) {
        console.error('Error fetching comments or file details:', error.message);
        res.status(500).send('Failed to retrieve comments or file details');
    }
});

// app.post('/notifications', express.json(), async (req, res) => {
//     const resourceId = req.headers['x-goog-resource-id'];
//     const resourceState = req.headers['x-goog-resource-state'];

//     console.log(`Received notification for resource: ${resourceId}, state: ${resourceState}`);

//     if (resourceState === 'update') {
//         try {
//             // Giả sử bạn có hàm để lấy lại nhận xét mới từ tài liệu
//             const fileId = await getFileIdFromResourceId(resourceId, `ya29.a0AXooCgsOH_nJS4nFkKMABUkLWOxrQ4pqKdPt4jXs4-F4LJzRzZ-3bhkGg1oY0VzZAChOTHr_oMJNKR2TF-ZmLwtJKG8FG7C92p8W0ajcGS8KwDNSTOYttIRskEQrMyi3rdTXi128-YDSGexPvsvClEYXXlc-7gtMlwaCgYKASYSARISFQHGX2MiWemUXyY8BoiNFNpbfihFEQ0169`);

//             const commentsResponse = await axios.get(`https://www.googleapis.com/drive/v2/files/${fileId}/comments`, {
//                 headers: {
//                     Authorization: `Bearer ${req.session.access_token}`
//                 }
//             });

//             const comments = commentsResponse.data.items;
//             console.log(`New comments for file ${fileId}:`, comments);

//             // Cập nhật giao diện người dùng hoặc lưu trữ các nhận xét mới

//         } catch (error) {
//             console.error(`Error fetching comments for file`, error.response.data);
//         }
//     }

//     res.status(200).send(); // Phản hồi thành công
// });

// function generateChannelId() {
//     return `channel-${uuidv4()}`;
// }

// async function watchFile(fileId, accessToken) {
//     const url = `https://www.googleapis.com/drive/v3/files/${fileId}/watch`;
//     const channelId = fileId; // Sử dụng fileId để tạo ID kênh duy nhất
//     const expirationTime = (Date.now() + 7 * 24 * 60 * 60 * 1000).toString(); // Thời gian hết hạn (7 ngày)

//     const ngrokUrl = 'https://f1a3-42-115-133-234.ngrok-free.app'
//     const requestBody = {
//         id: channelId,
//         type: 'web_hook',
//         address: `${ngrokUrl}/notifications`, // Đổi 'your-domain.com' thành domain thật của bạn
//         expiration: expirationTime
//     };

//     try {
//         const response = await axios.post(url, requestBody, {
//             headers: {
//                 Authorization: `Bearer ${accessToken}`,
//                 'Content-Type': 'application/json'
//             }
//         });

//         console.log(`Watch channel created for file ${fileId}:`, response.data);
//     } catch (error) {
//         console.error(`Error creating watch channel for file ${fileId}:`, error.response.data);
//     }
// }

// async function getFileIdFromResourceId(resourceId, accessToken) {
//     try {
//         // Lấy thông tin chi tiết của tài liệu từ resourceId
//         const response = await axios.get(`https://www.googleapis.com/drive/v3/channels/${resourceId}`, {
//             headers: {
//                 Authorization: `Bearer ${accessToken}`
//             }
//         });

//         // Lấy fileId từ response
//         return response.data.resourceId || null;
//     } catch (error) {
//         console.error(`Error fetching file details from resourceId ${resourceId}:`, error.response.data);
//         throw error;
//     }
// }

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});