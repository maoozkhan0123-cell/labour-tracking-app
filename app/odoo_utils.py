import xmlrpc.client
import os

class OdooClient:
    def __init__(self):
        self.url = os.environ.get('ODOO_URL', 'https://your-odoo-url.com')
        self.db = os.environ.get('ODOO_DB', 'your-db-name')
        self.username = os.environ.get('ODOO_USER', 'your-username')
        self.password = os.environ.get('ODOO_PASSWORD', 'your-api-key')
        self.uid = None

    def _connect(self):
        if self.uid:
            return True
        try:
            common = xmlrpc.client.ServerProxy(f'{self.url}/xmlrpc/2/common')
            self.uid = common.authenticate(self.db, self.username, self.password, {})
            return self.uid is not None
        except Exception as e:
            print(f"Odoo Connection Error: {e}")
            return False

    def get_active_mo_list(self, limit=10, search_query=None):
        if not self._connect():
            return []
        
        try:
            models = xmlrpc.client.ServerProxy(f'{self.url}/xmlrpc/2/object')
            # Broader search: include planned and draft if confirmed/progress isn't enough
            domain = [('state', 'in', ['confirmed', 'progress', 'planned', 'to_close'])]
            if search_query:
                domain.append('|')
                domain.append(('name', 'ilike', search_query))
                domain.append(('product_id.name', 'ilike', search_query))
                
            mo_ids = models.execute_kw(self.db, self.uid, self.password,
                'mrp.production', 'search', [domain], {'limit': limit, 'order': 'date_planned_start desc'})
            
            if not mo_ids:
                return []

            mos = models.execute_kw(self.db, self.uid, self.password,
                'mrp.production', 'read', [mo_ids], {'fields': ['name', 'product_id', 'qty_producing', 'state']})
            
            return mos
        except Exception as e:
            print(f"Odoo Data Fetch Error: {e}")
            return []

# Placeholder instance
odoo = OdooClient()
