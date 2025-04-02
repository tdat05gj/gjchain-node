let currentWallet = null;

async function loginWallet() {
    const privateKey = document.getElementById('privateKey').value;
    const response = await fetch('https://gjchain-wallet.onrender.com/balance/gj' + CryptoJS.SHA256(privateKey).toString().slice(0, 16));
    const wallet = await response.json();
    
    if (wallet.error) {
        const walletResponse = await fetch('https://gjchain-wallet.onrender.com/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const newWallet = await walletResponse.json();
        if (newWallet.privateKey === privateKey) {
            currentWallet = newWallet;
            document.getElementById('walletInfo').innerText = `Đã đăng nhập: ${currentWallet.address} (Số dư: ${wallet.balance || 0} GJCoin)`;
            updateHolders();
            updateHistory();
        } else {
            document.getElementById('walletInfo').innerText = 'Private key không hợp lệ';
        }
    } else {
        currentWallet = { address: 'gj' + CryptoJS.SHA256(privateKey).toString().slice(0, 16), privateKey };
        document.getElementById('walletInfo').innerText = `Đã đăng nhập: ${currentWallet.address} (Số dư: ${wallet.balance} GJCoin)`;
        updateHolders();
        updateHistory();
    }
}

async function sendCoin() {
    if (!currentWallet) {
        document.getElementById('sendStatus').innerText = 'Vui lòng đăng nhập ví trước!';
        return;
    }

    const toAddress = document.getElementById('toAddress').value;
    const amount = parseFloat(document.getElementById('amount').value);

    const response = await fetch('https://gjchain-node.onrender.com/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromAddress: currentWallet.address, toAddress, amount, privateKey: currentWallet.privateKey })
    });
    const result = await response.json();

    document.getElementById('sendStatus').innerText = result.message || result.error;
    updateHolders();
    updateHistory();
}

async function startMining() {
    if (!currentWallet) {
        document.getElementById('miningStatus').innerText = 'Vui lòng đăng nhập ví trước!';
        return;
    }

    const chainResponse = await fetch('https://gjchain-node.onrender.com/chain');
    const chain = await chainResponse.json();
    const latestBlock = chain[chain.length - 1];

    const pendingResponse = await fetch('https://gjchain-node.onrender.com/pending');
    const pendingTransactions = await pendingResponse.json();

    const block = {
        index: chain.length,
        timestamp: new Date().toISOString(),
        data: pendingTransactions,
        previousHash: latestBlock.hash,
        miner: currentWallet.address,
        nonce: 0
    };

    const difficulty = 4;
    const target = '0'.repeat(difficulty);
    block.hash = calculateHash(block);

    document.getElementById('miningStatus').innerText = 'Bắt đầu đào...';
    while (block.hash.substring(0, difficulty) !== target) {
        block.nonce++;
        block.hash = calculateHash(block);
    }
    document.getElementById('miningStatus').innerText = 'Đào xong! Gửi khối lên server...';

    const submitResponse = await fetch('https://gjchain-node.onrender.com/submit-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block)
    });
    const result = await submitResponse.json();

    document.getElementById('miningStatus').innerText = result.error || 'Khối đã được chấp nhận!';
    updateHolders();
    updateHistory();
}

function calculateHash(block) {
    const data = block.index + block.timestamp + JSON.stringify(block.data) + block.previousHash + block.miner + block.nonce;
    return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
}

async function updateHolders() {
    const response = await fetch('https://gjchain-node.onrender.com/holders');
    const holders = await response.json();
    const tbody = document.getElementById('holdersTable').getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';
    holders.forEach(holder => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${holder.address}</td><td>${holder.balance}</td>`;
        tbody.appendChild(row);
    });
}

async function updateHistory() {
    if (!currentWallet) return;
    const response = await fetch(`https://gjchain-node.onrender.com/history/${currentWallet.address}`);
    const history = await response.json();
    const tbody = document.getElementById('historyTable').getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';

    history.sent.forEach(tx => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>Gửi</td><td>${tx.from}</td><td>${tx.to}</td><td>${tx.amount}</td><td>${tx.timestamp}</td>`;
        tbody.appendChild(row);
    });
    history.received.forEach(tx => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>Nhận</td><td>${tx.from}</td><td>${tx.to}</td><td>${tx.amount}</td><td>${tx.timestamp}</td>`;
        tbody.appendChild(row);
    });
}

// Cập nhật ban đầu
updateHolders();
