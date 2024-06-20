require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('querystring');
const cors = require('cors'); 
const path = require('path');
const session = require('express-session');
// const { v4: uuidv4 } = require('uuid');
const app = express();

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SCOPE = process.env.SCOPE;
const HOST = '0.0.0.0';

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

        // Lưu trữ access token vào session của người dùng
        req.session.access_token = tokenResponse.data.access_token;
        res.redirect('/get-comments');
    } catch (error) {
        console.error('Error exchanging code for tokens:', error.message);
        res.status(500).send('Failed to authenticate');
    }
});

// Trang cho phép người dùng nhập link Google Docs
app.get('/enter-link', (req, res) => {
    if (!req.session.access_token) {
        return res.redirect('/auth/google');
    }
    res.render('enter-link');
});

// Lấy comment từ một danh sách các link Google Docs
app.get('/get-comments', async (req, res) => {
    if (!req.session.access_token) {
        return res.redirect('/auth/google');
    }
 
    var fileUrls = req.query.fileUrls; // Lấy URLs từ query parameter

    req.session.files = req.session.files || []
    // for (const url of req.session.files) {
    //     fileUrls += url
    // }

    if (!fileUrls && !req.session.files) {
        return res.status(400).send('No Google Docs URLs provided.');
    }

    var urls = fileUrls ? fileUrls.split('\n').map(url => url.trim()).filter(url => url !== '') : []; // Chia tách các URL bằng dấu xuống dòng và bỏ qua dòng trống

    urls = [...new Set([...urls, ...req.session.files])];

    if (urls.length != 0) {
        const results = { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0 };
        const tagRegex = /\[F([1-5])\]/;
        const allDocuments = [];
    
        try {
            // Duyệt qua từng URL để lấy nhận xét và tên tài liệu
          
            for (const url of urls) {
    
                if (!req.session.files.includes(url)) {
                    req.session.files.push(url);
                }
    
                const fileId = extractFileId(url);
                if (fileId) {
                    // Lấy thông tin chi tiết của tài liệu
                    const fileDetailsResponse = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`, {
                        headers: {
                            Authorization: `Bearer ${req.session.access_token}`
                        }
                    });
    
                    const fileName = fileDetailsResponse.data.name;
    
                    // Lấy nhận xét từ tài liệu
                    const commentsResponse = await axios.get(`https://www.googleapis.com/drive/v2/files/${fileId}/comments`, {
                        headers: {
                            Authorization: `Bearer ${req.session.access_token}`
                        }
                    });
    
                    const comments = commentsResponse.data.items;
    
                    // Tạo một đối tượng chứa tên tài liệu và nhận xét
                    allDocuments.push({ fileName, url});
    
                    const tagRegex = /\[F(\d+)(\.\d+)*\]/;

                    const commentContents = comments.map(comment => comment.content);
                    
                    commentContents.forEach(content => {
                        // Find all matches for the tag pattern in the content
                        const matches = content.match(tagRegex);
                    
                        if (matches) {
                            // Extract the main tag number (e.g., 1 from [F1], 1 from [F1.1], etc.)
                            const tagKey = matches[1];
                    
                            // Increment the corresponding result if it exists
                            if (results.hasOwnProperty(`F${tagKey}`)) {
                                results[`F${tagKey}`]++;
                            }
                        }
                    });
    
                    // Lưu tệp vào session
                    console.log(req.session.files);
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
    }else{
        res.render('index', { results:[], allDocuments:[], sum:0 });
    }
});

// Hàm để trích xuất fileId từ URL Google Docs
function extractFileId(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}


app.listen(PORT, HOST, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});