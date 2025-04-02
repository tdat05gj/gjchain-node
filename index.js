const express = require('express');
const WebSocket = require('ws');
const admin = require('firebase-admin');
const app = express();
const port = process.env.PORT || 3003;

// Khởi tạo Firebase với biến môi trường
let serviceAccount;
if (process.env.FIREBASE_ADMINSDK) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_ADMINSDK);
    } catch (error) {
        console.error('Error parsing FIREBASE_ADMINSDK:', error);
        throw new Error('Invalid FIREBASE_ADMINSDK environment variable');
    }
} else {
    console.log('FIREBASE_ADMINSDK not found, falling back to local file');
    serviceAccount = require('../gjchain/firebase-adminsdk.json');
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const blockchainCollection = admin.firestore().collection('gjchain');
const walletsCollection = admin.firestore().collection('wallets');
const transactionsCollection = admin.firestore().collection('transactions');

app.use(express.json());
app.use(express.static('public'));

class Block {
    constructor(index, timestamp, data, previousHash = '', miner, nonce, hash) {
        this.index = index;
        this.timestamp = timestamp;
        this.data = data;
        this.previousHash = previousHash;
        this.miner = miner;
        this.nonce = nonce;
        this.hash = hash;
    }

    calculateHash() {
        return require('crypto').createHash('sha256').update(
            this.index + this.timestamp + JSON.stringify(this.data) + this.previousHash + this.miner + this.nonce
        ).digest('hex');
    }
}

// Submit khối từ client
app.post('/submit-block', async (req, res) => {
    const { index, timestamp, data, previousHash, miner, nonce, hash } = req.body;
    const block = new Block(index, timestamp, data, previousHash, miner, nonce, hash);
    const difficulty = 4;

    if (block.hash !== block.calculateHash() || block.hash.substring(0, difficulty) !== '0'.repeat(difficulty)) {
        return res.status(400).json({ error: 'Khối không hợp lệ' });
    }

    const chainSnapshot = await blockchainCollection.orderBy('index').get();
    const chain = chainSnapshot.docs.map(doc => doc.data());
    if (block.previousHash !== chain[chain.length - 1].hash || block.index !== chain.length) {
        return res.status(400).json({ error: 'Khối không khớp với chuỗi hiện tại' });
    }

    for (const tx of block.data) {
        await walletsCollection.doc(tx.from).update({ balance: admin.firestore.FieldValue.increment(-tx.amount) });
        await walletsCollection.doc(tx.to).update({ balance: admin.firestore.FieldValue.increment(tx.amount) }, { merge: true });
        await transactionsCollection.doc().set(tx); // Lưu lịch sử giao dịch
    }
    await walletsCollection.doc(miner).update({ balance: admin.firestore.FieldValue.increment(10) }, { merge: true });
    await blockchainCollection.doc(block.index.toString()).set({ ...block });

    res.json(block);
});

// Lấy chuỗi khối
app.get('/chain', async (req, res) => {
    const snapshot = await blockchainCollection.orderBy('index').get();
    res.json(snapshot.docs.map(doc => doc.data()));
});

// Lấy giao dịch chờ xử lý
app.get('/pending', async (req, res) => {
    const pendingSnapshot = await blockchainCollection.doc('pending').get();
    res.json(pendingSnapshot.exists ? pendingSnapshot.data().transactions : []);
});

// Gửi giao dịch
app.post('/send', async (req, res) => {
    const { fromAddress, toAddress, amount, privateKey } = req.body;
    const walletDoc = await walletsCollection.doc(fromAddress).get();
    if (!walletDoc.exists || walletDoc.data().privateKey !== privateKey) {
        return res.status(400).json({ error: 'Private key không hợp lệ' });
    }
    if (walletDoc.data().balance < amount) {
        return res.status(400).json({ error: 'Không đủ số dư' });
    }

    const transaction = { from: fromAddress, to: toAddress, amount, timestamp: new Date().toISOString() };
    const pendingSnapshot = await blockchainCollection.doc('pending').get();
    const pendingTransactions = pendingSnapshot.exists ? pendingSnapshot.data().transactions : [];
    pendingTransactions.push(transaction);
    await blockchainCollection.doc('pending').set({ transactions: pendingTransactions });

    res.json({ message: 'Giao dịch đã được thêm vào hàng chờ' });
});

// Lấy danh sách holder
app.get('/holders', async (req, res) => {
    const snapshot = await walletsCollection.get();
    res.json(snapshot.docs.map(doc => ({ address: doc.id, balance: doc.data().balance })));
});

// Lấy lịch sử giao dịch của ví
app.get('/history/:address', async (req, res) => {
    const address = req.params.address;
    const snapshot = await transactionsCollection
        .where('from', '==', address)
        .orderBy('timestamp', 'desc')
        .get();
    const sent = snapshot.docs.map(doc => doc.data());
    const receivedSnapshot = await transactionsCollection
        .where('to', '==', address)
        .orderBy('timestamp', 'desc')
        .get();
    const received = receivedSnapshot.docs.map(doc => doc.data());
    res.json({ sent, received });
});

app.listen(port, () => console.log(`Mining Node chạy tại http://localhost:${port}`));
