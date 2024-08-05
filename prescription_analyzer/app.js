const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Prescription analyzer functions
const extractMedications = (prescriptionText) => {
    const medicationPattern = /\b(?:aspirin|ibuprofen|paracetamol|acetaminophen|tylenol|advil|aleve)\b/gi;
    return new Set(prescriptionText.match(medicationPattern));
};

const comparePrescriptions = (prevPrescription, latestPrescription) => {
    const prevMedications = extractMedications(prevPrescription);
    const latestMedications = extractMedications(latestPrescription);

    const continuedMedications = new Set([...prevMedications].filter(med => latestMedications.has(med)));
    const newMedications = new Set([...latestMedications].filter(med => !prevMedications.has(med)));
    const restrictedMedications = new Set([...prevMedications].filter(med => !latestMedications.has(med)));

    return { continuedMedications, newMedications, restrictedMedications };
};

const extractTextFromPDF = async (filePath) => {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
};

// Routes
app.get('/', (req, res) => {
    res.render('first');
});

app.route('/signup')
    .get((req, res) => {
        res.render('index');
    })
    .post((req, res) => {
        const { username, email, password } = req.body;

        fs.appendFileSync('users.txt', `Username: ${username}, Email: ${email}, Password: ${password}\n`);

        const userHtml = `<h1>Welcome, ${username}!</h1>`;
        const userFilePath = path.join(__dirname, 'users', `${username}.html`);
        fs.mkdirSync(path.dirname(userFilePath), { recursive: true });
        fs.writeFileSync(userFilePath, userHtml);

        res.redirect(`/users/${username}`);
    });

app.route('/signin')
    .get((req, res) => {
        res.render('signin');
    })
    .post((req, res) => {
        const { username, password } = req.body;
        const users = fs.readFileSync('users.txt', 'utf-8').split('\n');

        for (const user of users) {
            if (user.startsWith(`Username: ${username}, Password: ${password}`)) {
                return res.redirect(`/users/${username}`);
            }
        }
        res.send('Invalid Username or Password');
    });

app.get('/users/:username', (req, res) => {
    const { username } = req.params;
    const userFilePath = path.join(__dirname, 'users', `${username}.html`);

    if (fs.existsSync(userFilePath)) {
        const userHtml = fs.readFileSync(userFilePath, 'utf-8');
        res.send(userHtml);
    } else {
        res.send('User not found');
    }
});

app.route('/analyze_prescription/:username')
    .get((req, res) => {
        res.render('prescription_analysis', { username: req.params.username, continuedMedications: [], newMedications: [], restrictedMedications: [] });
    })
    .post(upload.fields([{ name: 'prev_prescription' }, { name: 'latest_prescription' }]), async (req, res) => {
        const { username } = req.params;
        const prevPrescriptionFile = req.files['prev_prescription'][0];
        const latestPrescriptionFile = req.files['latest_prescription'][0];

        if (prevPrescriptionFile && latestPrescriptionFile) {
            const prevPrescriptionText = await extractTextFromPDF(prevPrescriptionFile.path);
            const latestPrescriptionText = await extractTextFromPDF(latestPrescriptionFile.path);

            const { continuedMedications, newMedications, restrictedMedications } = comparePrescriptions(prevPrescriptionText, latestPrescriptionText);

            res.render('prescription_analysis', { username, continuedMedications, newMedications, restrictedMedications });

            fs.unlinkSync(prevPrescriptionFile.path);
            fs.unlinkSync(latestPrescriptionFile.path);
        } else {
            res.send("No files received");
        }
    });

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
