import xmlrpc.client
import os

class OdooClient:
    def __init__(self):
        # Handle both naming conventions
        self.url = os.environ.get('ODOO_URL', 'https://your-odoo-url.com').rstrip('/')
        self.db = os.environ.get('ODOO_DB', 'your-db-name')
        self.username = os.environ.get('ODOO_USER') or os.environ.get('ODOO_USERNAME') or 'your-username'
        self.password = os.environ.get('ODOO_PASSWORD', 'your-api-key')
        self.uid = None

    def _connect(self):
        if self.uid:
            return True
        try:
            print(f"Connecting to Odoo: {self.url} | DB: {self.db} | User: {self.username}")
            common = xmlrpc.client.ServerProxy(f'{self.url}/xmlrpc/2/common')
            self.uid = common.authenticate(self.db, self.username, self.password, {})
            print(f"Odoo Auth Result UID: {self.uid}")
            return self.uid is not None
        except Exception as e:
            print(f"Odoo Connection Error: {str(e)}")
            return False

    def get_active_mo_list(self, limit=10, search_query=None):
        if not self._connect():
            raise Exception("Odoo Login Failed: Check URL, DB, Username, and Password environment variables.")
        
        try:
            models = xmlrpc.client.ServerProxy(f'{self.url}/xmlrpc/2/object')
            
            # Use a VERY broad state list for debugging
            states = ['draft', 'confirmed', 'planned', 'progress', 'to_close', 'done']
            domain = [('state', 'in', states)]
            
            if search_query and search_query.strip():
                domain.append('|')
                domain.append(('name', 'ilike', search_query))
                domain.append(('product_id.name', 'ilike', search_query))
            
            print(f"Searching Odoo MOs with domain: {domain}")
                
            mo_ids = models.execute_kw(self.db, self.uid, self.password,
                'mrp.production', 'search', [domain], {'limit': limit, 'order': 'id desc'})
            
            if not mo_ids:
                return []

            mos = models.execute_kw(self.db, self.uid, self.password,
                'mrp.production', 'read', [mo_ids], {'fields': ['name', 'product_id', 'qty_producing', 'state']})
            
            return mos
        except Exception as e:
            print(f"Odoo Data Fetch Error: {str(e)}")
            raise Exception(f"Failed to fetch from mrp.production: {str(e)}")

# Placeholder instance
odoo = OdooClient()
