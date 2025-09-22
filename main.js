/* ====== IndexedDB helper ====== */
const DB_NAME = 'crm_offline_db', DB_VERSION = 1;
let db;
function openDb(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      db = req.result;
      if(!db.objectStoreNames.contains('customers')){
        const cs = db.createObjectStore('customers',{keyPath:'id',autoIncrement:true});
        cs.createIndex('name','name',{unique:false});
      }
      if(!db.objectStoreNames.contains('items')){
        const is = db.createObjectStore('items',{keyPath:'id',autoIncrement:true});
        is.createIndex('name','name',{unique:false});
      }
      if(!db.objectStoreNames.contains('sales')){
        const ss = db.createObjectStore('sales',{keyPath:'id',autoIncrement:true});
        ss.createIndex('sale_date','sale_date',{unique:false});
      }
      if(!db.objectStoreNames.contains('sale_items')){
        db.createObjectStore('sale_items',{keyPath:'id',autoIncrement:true});
      }
      if(!db.objectStoreNames.contains('payments')){
        db.createObjectStore('payments',{keyPath:'id',autoIncrement:true});
      }
    };
    req.onsuccess = ()=>{ db=req.result; res(db); };
    req.onerror = ()=> rej(req.error);
  });
}
function tx(storeNames, mode='readonly'){
  const t = db.transaction(storeNames, mode);
  const obj = {};
  for(const s of storeNames) obj[s] = t.objectStore(s);
  return {t, obj};
}
function add(store, val){ return new Promise((res,rej)=>{ const {obj} = tx([store],'readwrite'); const r = obj[store].add(val); r.onsuccess = e=>res(e.target.result); r.onerror = e=>rej(e.target.error); }); }
function put(store, val){ return new Promise((res,rej)=>{ const {obj} = tx([store],'readwrite'); const r = obj[store].put(val); r.onsuccess = e=>res(e.target.result); r.onerror = e=>rej(e.target.error); }); }
function getAll(store){ return new Promise((res,rej)=>{ const {obj} = tx([store]); const r = obj[store].getAll(); r.onsuccess = e=>res(e.target.result); r.onerror = e=>rej(e.target.error); }); }
function getById(store,id){ return new Promise((res,rej)=>{ const {obj} = tx([store]); const r = obj[store].get(id); r.onsuccess = e=>res(e.target.result); r.onerror = e=>rej(e.target.error); }); }
function del(store,id){ return new Promise((res,rej)=>{ const {obj} = tx([store],'readwrite'); const r = obj[store].delete(id); r.onsuccess = e=>res(true); r.onerror = e=>rej(e.target.error); }); }
function clearAll(){ return new Promise((res,rej)=>{ const req = indexedDB.deleteDatabase(DB_NAME); req.onsuccess = ()=>res(); req.onerror = e=>rej(e.target.error); }); }

/* ======= Utilities ======= */
function $(sel,el=document){return el.querySelector(sel)}
function $all(sel,el=document){return Array.from(el.querySelectorAll(sel))}
function fmt(n){return Number(n||0).toFixed(2)}
function nowIso() {
  const now = new Date();
  const offsetMs = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + offsetMs);

  const dd = String(istTime.getUTCDate()).padStart(2, '0');
  const mm = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = istTime.getUTCFullYear();

  let hh = istTime.getUTCHours();
  const min = String(istTime.getUTCMinutes()).padStart(2, '0');
  const ss = String(istTime.getUTCSeconds()).padStart(2, '0');

  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 || 12; // convert to 12h format

  return `${dd}-${mm}-${yyyy} Time: ${hh}:${min}:${ss} ${ampm}`;
}



/* ======= App init ======= */
let modal;
window.addEventListener('load', async ()=>{
  modal = new bootstrap.Modal(document.getElementById('entityModal'));
  await openDb();
  $('#dbStatus').innerText = 'Ready';
  bindMenu();
  bindButtons();
  showPage('dashboard');
  refreshStats();
});

/* ======= Navigation ======= */
function bindMenu(){
  $all('#menu .nav-link').forEach(a=>{
    a.addEventListener('click', ()=>{ $all('#menu .nav-link').forEach(x=>x.classList.remove('active')); a.classList.add('active'); showPage(a.dataset.target); });
  });
}
function showPage(id){
  $all('.page').forEach(p=>p.classList.add('d-none'));
  const el = document.getElementById(id);
  if(el) el.classList.remove('d-none');
  if(id==='customers') loadCustomers();
  if(id==='items') loadItems();
  if(id==='create-sale') prepareSaleForm();
  if(id==='payments') preparePaymentForm();
  //if(id==='reports'){}
}

/* ======= Customers CRUD ======= */
function bindButtons(){
  $('#addCustomerBtn').addEventListener('click', ()=>openCustomerModal());
  $('#addItemBtn').addEventListener('click', ()=>openItemModal());
  $('#addSaleRow').addEventListener('click', addSaleRow);
  $('#saleForm').addEventListener('submit', onSaveSale);
  $('#paymentForm').addEventListener('submit', onSavePayment);
  $('#btnBackup').addEventListener('click', exportJson);
  $('#btnRestore').addEventListener('click', ()=>{ const input = document.createElement('input'); input.type='file'; input.accept='application/json'; input.onchange=importJson; input.click(); });
  $('#clearSite').addEventListener('click', async ()=>{ if(confirm('Delete all local data? This cannot be undone.')){ await clearAll(); location.reload(); } });
}

async function loadCustomers(){
  const customers = await getAll('customers');
  const container = $('#customersList'); container.innerHTML='';
  if(customers.length===0){ container.innerHTML='<p class="small-muted">No customers yet.</p>'; return; }
  const table = document.createElement('table'); table.className='table table-sm';
  table.innerHTML='<thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Actions</th></tr></thead>';
  const tbody = document.createElement('tbody');
  customers.forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.id}</td><td>${c.name}</td><td>${c.contact||''}</td><td>
      <button class="btn btn-sm btn-link view-customer">View</button>
      <button class="btn btn-sm btn-link edit-customer">Edit</button>
      <button class="btn btn-sm btn-link text-danger delete-customer">Delete</button>
    </td>`;
    tr.querySelector('.view-customer').addEventListener('click', ()=>viewCustomer(c.id));
    tr.querySelector('.edit-customer').addEventListener('click', ()=>openCustomerModal(c));
    tr.querySelector('.delete-customer').addEventListener('click', async ()=>{ if(confirm('Delete customer?')){ await del('customers',c.id); loadCustomers(); refreshStats(); } });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); container.appendChild(table);
}

function openCustomerModal(customer){
  document.getElementById('entityModalTitle').innerText = customer? 'Edit Customer':'Add Customer';
  const body = document.getElementById('entityModalBody');
  body.innerHTML = `
    <form id="custForm">
      <div class="mb-2"><label class="form-label required">Name</label><input class="form-control" name="name" required value="${customer?escapeHtml(customer.name):''}"></div>
      <div class="mb-2"><label class="form-label">Contact</label><input class="form-control" name="contact" value="${customer?escapeHtml(customer.contact):''}"></div>
      <div class="mb-2"><label class="form-label">Email</label><input class="form-control" name="email" value="${customer?escapeHtml(customer.email):''}"></div>
      <div class="mb-2"><label class="form-label">Address</label><textarea class="form-control" name="address">${customer?escapeHtml(customer.address):''}</textarea></div>
      <div class="text-end"><button class="btn btn-primary">Save</button></div>
    </form>`;
  modal.show();
  $('#custForm').addEventListener('submit', async (e)=>{ e.preventDefault(); const fd = new FormData(e.target); const obj = {name:fd.get('name'), contact:fd.get('contact'), email:fd.get('email'), address:fd.get('address'), created_at: nowIso()}; if(customer) obj.id=customer.id; await (customer? put('customers',obj): add('customers',obj)); modal.hide(); loadCustomers(); refreshStats(); });
}

async function viewCustomer(id){
  const c = await getById('customers', id);
  const sales = (await getAll('sales')).filter(s=>s.customer_id===id);
  const payments = (await getAll('payments')).filter(p=>p.customer_id===id);
  let html = `<h5>${escapeHtml(c.name)}</h5><p>${escapeHtml(c.contact||'')} ${escapeHtml(c.email||'')}</p>`;
  html += '<h6>Sales</h6>';
  if(sales.length===0) html+='<p class="small-muted">No sales</p>'; else html += '<ul>'+sales.map(s=>`<li>${s.invoice_no} • ${s.sale_date} • ₹${fmt(s.total_amount)}</li>`).join('')+'</ul>';
  html += '<h6>Payments</h6>';
  if(payments.length===0) html+='<p class="small-muted">No payments</p>'; else html += '<ul>'+payments.map(p=>`<li>${p.payment_date} • ₹${fmt(p.amount)} ${escapeHtml(p.note||'')}</li>`).join('')+'</ul>';
  document.getElementById('entityModalTitle').innerText='Customer Details'; document.getElementById('entityModalBody').innerHTML = html; modal.show();
}

/* ======= Items CRUD ======= */
async function loadItems(){
  const items = await getAll('items');
  const container = $('#itemsList'); container.innerHTML='';
  if(items.length===0){ container.innerHTML='<p class="small-muted">No items yet.</p>'; return; }
  const table = document.createElement('table'); table.className='table table-sm';
  table.innerHTML='<thead><tr><th>ID</th><th>Name</th><th>Price</th><th>GST%</th><th>Actions</th></tr></thead>';
  const tbody = document.createElement('tbody');
  items.forEach(i=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i.id}</td><td>${escapeHtml(i.name)}</td><td>₹${fmt(i.price)}</td><td>${fmt(i.gst_rate)}</td><td>
      <button class="btn btn-sm btn-link edit-item">Edit</button>
      <button class="btn btn-sm btn-link text-danger delete-item">Delete</button>
    </td>`;
    tr.querySelector('.edit-item').addEventListener('click', ()=>openItemModal(i));
    tr.querySelector('.delete-item').addEventListener('click', async ()=>{ if(confirm('Delete item?')){ await del('items',i.id); loadItems(); refreshStats(); } });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); container.appendChild(table);
}

function openItemModal(item){
  document.getElementById('entityModalTitle').innerText = item? 'Edit Item':'Add Item';
  const body = document.getElementById('entityModalBody');
  body.innerHTML = `
    <form id="itemForm">
      <div class="mb-2"><label class="form-label required">Name</label><input class="form-control" name="name" required value="${item?escapeHtml(item.name):''}"></div>
      <div class="mb-2"><label class="form-label">Description</label><textarea class="form-control" name="description">${item?escapeHtml(item.description):''}</textarea></div>
      <div class="mb-2"><label class="form-label required">Unit Price (excl GST)</label><input class="form-control" name="price" type="number" step="0.01" required value="${item?item.price:''}"></div>
      <div class="mb-2"><label class="form-label required">GST Rate (%)</label><input class="form-control" name="gst_rate" type="number" step="0.01" required value="${item?item.gst_rate:''}"></div>
      <div class="text-end"><button class="btn btn-primary">Save</button></div>
    </form>`;
  modal.show();
  $('#itemForm').addEventListener('submit', async (e)=>{ e.preventDefault(); const fd = new FormData(e.target); const obj = {name:fd.get('name'), description:fd.get('description'), price:parseFloat(fd.get('price')||0), gst_rate:parseFloat(fd.get('gst_rate')||0), created_at: nowIso()}; if(item) obj.id=item.id; await (item? put('items',obj): add('items',obj)); modal.hide(); loadItems(); refreshStats(); });
}

/* ======= Sales: create and store items ======= */
async function prepareSaleForm(){
  // populate customers and items
  const customers = await getAll('customers');
  const items = await getAll('items');
  const sel = $('#saleCustomer'); sel.innerHTML = '<option value="">-- select --</option>' + customers.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const tbody = $('#saleTable tbody'); tbody.innerHTML='';
  addSaleRow();
  // save item list in dataset for quick clone
  tbody.dataset.items = JSON.stringify(items);
}

function addSaleRow(){
  const tbody = $('#saleTable tbody');
  const items = JSON.parse(tbody.dataset.items||'[]');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="form-select form-select-sm sale-item"><option value="">-- select --</option>${items.map(it=>`<option value="${it.id}" data-price="${it.price}" data-gst="${it.gst_rate}">${escapeHtml(it.name)}</option>`).join('')}</select></td>
    <td><input class="form-control form-control-sm sale-qty" type="number" step="0.01" value="1"></td>
    <td><input class="form-control form-control-sm sale-unit" type="number" step="0.01"></td>
    <td><input class="form-control form-control-sm sale-gst" type="number" step="0.01"></td>
    <td class="sale-line">0.00</td>
    <td><button class="btn btn-sm btn-danger remove-row">Remove</button></td>
  `;
  tbody.appendChild(tr);
  // events
  tr.querySelector('.sale-item').addEventListener('change', (e)=>{ const opt = e.target.selectedOptions[0]; if(opt){ tr.querySelector('.sale-unit').value = opt.dataset.price || ''; tr.querySelector('.sale-gst').value = opt.dataset.gst || ''; recalcSaleRow(tr); } });
  tr.querySelector('.sale-qty').addEventListener('input', ()=>recalcSaleRow(tr));
  tr.querySelector('.sale-unit').addEventListener('input', ()=>recalcSaleRow(tr));
  tr.querySelector('.sale-gst').addEventListener('input', ()=>recalcSaleRow(tr));
  tr.querySelector('.remove-row').addEventListener('click', ()=>{ tr.remove(); recalcSaleTotals(); });
  recalcSaleRow(tr);
}

function recalcSaleRow(tr){
  const q = parseFloat(tr.querySelector('.sale-qty').value||0);
  const up = parseFloat(tr.querySelector('.sale-unit').value||0);
  const gst = parseFloat(tr.querySelector('.sale-gst').value||0);
  const excl = q*up; const gstAmt = excl * gst/100; const incl = excl + gstAmt; tr.querySelector('.sale-line').innerText = fmt(incl); recalcSaleTotals();
}
function recalcSaleTotals(){
  let totalGst=0, grand=0;
  $all('#saleTable tbody tr').forEach(tr=>{
    const q = parseFloat(tr.querySelector('.sale-qty').value||0);
    const up = parseFloat(tr.querySelector('.sale-unit').value||0);
    const gst = parseFloat(tr.querySelector('.sale-gst').value||0);
    const excl = q*up; const gstAmt = excl*gst/100; const incl = excl+gstAmt; totalGst+=gstAmt; grand+=incl;
  });
  $('#saleTotalGst').innerText = fmt(totalGst);
  $('#saleGrandTotal').innerText = fmt(grand);
}

async function onSaveSale(e){
  e.preventDefault();
  const customer_id = parseInt($('#saleCustomer').value);
  if(!customer_id){ alert('Select customer'); return; }
  const rows = $all('#saleTable tbody tr');
  const saleItems = [];
  for(const r of rows){
    const iid = r.querySelector('.sale-item').value; if(!iid) continue;
    const qty = parseFloat(r.querySelector('.sale-qty').value||0); const up = parseFloat(r.querySelector('.sale-unit').value||0); const gst = parseFloat(r.querySelector('.sale-gst').value||0);
    const excl = qty*up; const gstAmt = excl*gst/100; const incl = excl+gstAmt; saleItems.push({item_id:parseInt(iid), quantity:qty, unit_price:up, gst_rate:gst, gst_amount:round2(gstAmt), line_excl:round2(excl), line_incl:round2(incl)});
  }
  if(saleItems.length===0){ alert('Add at least one item'); return; }
  const total_gst = saleItems.reduce((s,i)=>s+i.gst_amount,0); const total_amount = saleItems.reduce((s,i)=>s+i.line_incl,0);
  const invoice_no = generateInvoiceNo(); const sale_date = nowIso();
  const saleObj = {invoice_no, sale_date, customer_id, total_amount:round2(total_amount), total_gst:round2(total_gst)};
  const saleId = await add('sales', saleObj);
  for(const it of saleItems){ it.sale_id = saleId; await add('sale_items', it); }
  alert('Sale saved: '+invoice_no);
  // reset
  prepareSaleForm(); refreshStats();
}

/* ======= Payments ======= */
async function preparePaymentForm(){
  const customers = await getAll('customers');
  $('#paymentCustomer').innerHTML = '<option value="">-- select --</option>'+customers.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  $('#paymentSale').innerHTML = '<option value="">-- none --</option>'+ (await getAll('sales')).map(s=>`<option value="${s.id}">${escapeHtml(s.invoice_no)} • ₹${fmt(s.total_amount)}</option>`).join('');
}
async function onSavePayment(e){ e.preventDefault(); const cid = parseInt($('#paymentCustomer').value); if(!cid){ alert('Select customer'); return; } const amount = parseFloat($('#paymentAmount').value||0); if(!amount){ alert('Enter amount'); return; } const sale_id = $('#paymentSale').value? parseInt($('#paymentSale').value): null; const note = $('#paymentNote').value; await add('payments', {customer_id:cid, sale_id, payment_date:nowIso(), amount:round2(amount), note}); alert('Payment recorded'); $('#paymentForm').reset(); refreshStats(); }

/* ======= Balances ======= */

document.querySelector('a[href="#balances"]').setAttribute('data-target', 'balances');
document.querySelector('a[href="#balances"]').removeAttribute('href');

// Now update the showPage function to handle the balances page
function showPage(id){
  $all('.page').forEach(p=>p.classList.add('d-none'));
  const el = document.getElementById(id);
  if(el) el.classList.remove('d-none');
  if(id==='customers') loadCustomers();
  if(id==='items') loadItems();
  if(id==='create-sale') prepareSaleForm();
  if(id==='payments') preparePaymentForm();
  if(id==='reports'){}
  if(id==='balances') loadBalances(); // This will load balances when the page is shown
}


async function loadBalances() {
  const balancesTable = document.getElementById("balancesTable");
  balancesTable.innerHTML = "<tr><td colspan='5'>Loading balances...</td></tr>";
  
  try {
    // Get all data we need
    const [customers, sales, payments] = await Promise.all([
      getAll('customers'),
      getAll('sales'),
      getAll('payments')
    ]);
    
    if (customers.length === 0) {
      balancesTable.innerHTML = '<tr><td colspan="5" class="small-muted">No customers found.</td></tr>';
      return;
    }
    
    // Clear the table
    balancesTable.innerHTML = '';
    
    // Process each customer
    for (const customer of customers) {
      // Filter sales and payments for this customer
      const customerSales = sales.filter(s => s.customer_id === customer.id);
      const customerPayments = payments.filter(p => p.customer_id === customer.id);
      
      // Calculate totals
      const totalSales = customerSales.reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
      const totalPayments = customerPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      const netBalance = totalSales - totalPayments;
      
      // Determine balance class
      let balanceClass = "balance-clear";
      if (netBalance > 0) balanceClass = "balance-positive";
      else if (netBalance < 0) balanceClass = "balance-negative";
      
      // Create table row
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(customer.name || 'Unknown')}</td>
        <td>₹ ${fmt(totalSales)}</td>
        <td>₹ ${fmt(totalPayments)}</td>
        <td class="${balanceClass}">₹ ${fmt(netBalance)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary view-statement" data-cid="${customer.id}">View Statement</button>
        </td>
      `;
      
      // Add event listener to the view statement button
      row.querySelector('.view-statement').addEventListener('click', function() {
        viewCustomer(customer.id);
      });
      
      balancesTable.appendChild(row);
    }
  } catch (error) {
    console.error("Error loading balances:", error);
    balancesTable.innerHTML = '<tr><td colspan="5" class="text-danger">Error loading balances. Check console for details.</td></tr>';
  }
}

function bindMenu(){
  $all('#menu .nav-link').forEach(a => {
    a.addEventListener('click', function(e) {
      // Prevent default for all links
      if (this.getAttribute('href') === '#balances') {
        e.preventDefault();
      }
      
      $all('#menu .nav-link').forEach(x => x.classList.remove('active'));
      this.classList.add('active');
      
      // Use data-target if available, otherwise try to get from href
      const target = this.dataset.target || (this.getAttribute('href') || '').substring(1);
      if (target) {
        showPage(target);
      }
    });
  });
}

/* ======= Reports ======= */
//$('#monthlyReportForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const v = $('#monthYear').value; if(!/^\d{4}-\d{2}$/.test(v)){ alert('Use YYYY-MM'); return; } const [y,m] = v.split('-').map(Number); const start = new Date(y,m-1,1); const end = new Date(y,m,1); const sales = (await getAll('sales')).filter(s=> new Date(s.sale_date) >= start && new Date(s.sale_date) < end); const totalSales = sales.reduce((s,x)=>s+x.total_amount,0); const totalGst = sales.reduce((s,x)=>s+x.total_gst,0); $('#monthlyReportResult').innerHTML = `<div class="p-2 border rounded"><strong>Period:</strong> ${v}<br><strong>Total Sales (incl GST):</strong> ₹${fmt(totalSales)}<br><strong>Total GST:</strong> ₹${fmt(totalGst)}</div>`; });

//$('#quarterReportForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const q = parseInt($('#quarterSelect').value); const y = parseInt($('#quarterYear').value); let start,end; if(q===1){ start=new Date(y,3,1); end=new Date(y,6,1);} else if(q===2){ start=new Date(y,6,1); end=new Date(y,9,1);} else if(q===3){ start=new Date(y,9,1); end=new Date(y+1,0,1);} else { start=new Date(y,0,1); end=new Date(y,3,1);} const sales=(await getAll('sales')).filter(s=> new Date(s.sale_date)>=start && new Date(s.sale_date)<end); const totalSales = sales.reduce((s,x)=>s+x.total_amount,0); const totalGst = sales.reduce((s,x)=>s+x.total_gst,0); $('#quarterReportResult').innerHTML = `<div class="p-2 border rounded"><strong>Period:</strong> ${start.toISOString().slice(0,10)} to ${(new Date(end-1)).toISOString().slice(0,10)}<br><strong>Total Sales (incl GST):</strong> ₹${fmt(totalSales)}<br><strong>Total GST:</strong> ₹${fmt(totalGst)}</div>`; });

/* ======= Export / Import JSON ======= */
async function exportJson(){ const data = {}; data.customers = await getAll('customers'); data.items = await getAll('items'); data.sales = await getAll('sales'); data.sale_items = await getAll('sale_items'); data.payments = await getAll('payments'); const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download = 'crm_backup_'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.json'; a.click(); URL.revokeObjectURL(url); $('#lastBackup').innerText = new Date().toLocaleString(); }
async function importJson(e){ const file = e.target.files[0]; if(!file) return; const txt = await file.text(); try{ const data = JSON.parse(txt); // simple import: clear and re-add
      if(!confirm('This will merge imported data into your DB. Continue?')) return; for(const c of data.customers||[]) { await add('customers', c); }
      for(const it of data.items||[]) { await add('items', it); }
      for(const s of data.sales||[]) { await add('sales', s); }
      for(const si of data.sale_items||[]) { await add('sale_items', si); }
      for(const p of data.payments||[]) { await add('payments', p); }
      alert('Import complete. You may need to refresh lists.'); refreshStats(); } catch(err){ alert('Invalid JSON'); }
}

/* ======= Helpers ======= */
function escapeHtml(s){ if(!s) return ''; return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function round2(n){ return Math.round((n+Number.EPSILON)*100)/100; }
function generateInvoiceNo(){ const d = new Date(); const prefix = 'INV-'+d.getFullYear()+(d.getMonth()+1).toString().padStart(2,'0')+d.getDate().toString().padStart(2,'0')+'-'; // simple counter by timestamp
  return prefix + Math.floor(Math.random()*900+100);
}
async function refreshStats(){ const customers = await getAll('customers'); const items = await getAll('items'); const sales = await getAll('sales'); const payments = await getAll('payments'); $('#statCustomers').innerText = customers.length; $('#statItems').innerText = items.length; // compute receivables
  const totalSales = sales.reduce((s,x)=>s+x.total_amount,0); const totalPayments = payments.reduce((s,x)=>s+x.amount,0); $('#statReceivables').innerText = fmt(totalSales - totalPayments);
}