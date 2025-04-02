async function mine() {
    const minerAddress = document.getElementById('minerAddress').value;
    const response = await fetch('/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minerAddress })
    });
    const block = await response.json();
    document.getElementById('output').textContent = `Khối mới: ${JSON.stringify(block, null, 2)}`;
}