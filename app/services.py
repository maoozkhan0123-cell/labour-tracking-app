import xmlrpc.client
import os
from datetime import date
from dotenv import load_dotenv

load_dotenv()

class OdooService:
    def __init__(self):
        self.url = os.getenv('ODOO_URL')
        self.db = os.getenv('ODOO_DB')
        self.username = os.getenv('ODOO_USERNAME')
        self.password = os.getenv('ODOO_PASSWORD')
        self.uid = None
        self.models = None

    def get_today_date(self):
        return date.today().strftime('%Y-%m-%d')

    def connect(self):
        if not all([self.url, self.db, self.username, self.password]):
            print("Odoo credentials missing")
            return False
            
        try:
            common = xmlrpc.client.ServerProxy(f'{self.url}/xmlrpc/2/common')
            self.uid = common.authenticate(self.db, self.username, self.password, {})
            self.models = xmlrpc.client.ServerProxy(f'{self.url}/xmlrpc/2/object')
            return bool(self.uid)
        except Exception as e:
            print(f"Connection failed: {e}")
            return False

    def ensure_connection(self):
        if not self.uid:
            return self.connect()
        return True

    def get_confirmed_mos(self):
        if not self.ensure_connection():
            return []
        
        try:
            mos = self.models.execute_kw(self.db, self.uid, self.password,
                'mrp.production', 'search_read',
                [[['state', 'in', ['confirmed', 'progress']]]],
                {'fields': ['name', 'product_id', 'qty_producing', 'state']})
            return mos
        except Exception as e:
            print(f"Error fetching MOs: {e}")
            return []

    def get_employees(self):
        if not self.ensure_connection():
            return []
        try:
            employees = self.models.execute_kw(self.db, self.uid, self.password,
                'hr.employee', 'search_read',
                [[['active', '=', True]]],
                {'fields': ['name', 'hourly_cost', 'job_id']})
            return employees
        except Exception as e:
            print(f"Error fetching employees: {e}")
            return []

    def ensure_labor_product(self):
        if not self.ensure_connection():
            return None
            
        product_name = "Direct Labor (Manual)"
        try:
            ids = self.models.execute_kw(self.db, self.uid, self.password,
                'product.product', 'search',
                [[['name', '=', product_name], ['type', '=', 'service']]])
            
            if ids:
                return ids[0]
            
            id = self.models.execute_kw(self.db, self.uid, self.password,
                'product.product', 'create',
                [{
                    'name': product_name,
                    'type': 'service',
                    'uom_id': 1,
                    'uom_po_id': 1,
                    'standard_price': 0.0,
                }])
            return id
        except Exception as e:
            print(f"Error ensuring labor product: {e}")
            return None

    def record_labor(self, mo_id, employee_id, duration_hours, description):
        if not self.ensure_connection():
            return False

        try:
            # 1. Get Employee Data for Cost
            employee = self.models.execute_kw(self.db, self.uid, self.password,
                'hr.employee', 'read',
                [int(employee_id)],
                {'fields': ['hourly_cost', 'name']})
            
            if not employee:
                return False
            
            hourly_rate = employee[0]['hourly_cost'] or 0.0
            
            # 2. Push to Timesheet (account.analytic.line)
            try:
                aa_ids = self.models.execute_kw(self.db, self.uid, self.password,
                    'account.analytic.account', 'search',
                    [[['name', 'ilike', 'Manufacturing']]], {'limit': 1})
                
                if not aa_ids:
                    aa_ids = self.models.execute_kw(self.db, self.uid, self.password,
                        'account.analytic.account', 'search',
                        [[]], {'limit': 1})
                
                if aa_ids:
                    self.models.execute_kw(self.db, self.uid, self.password,
                        'account.analytic.line', 'create',
                        [{
                            'name': f"MO Labor: {description}",
                            'account_id': aa_ids[0],
                            'employee_id': int(employee_id),
                            'unit_amount': duration_hours,
                            'date': self.get_today_date(),
                        }])
            except Exception as e:
                print(f"Timesheet sync failed: {e}")
            
            # 3. Add Service Component to MO (move_raw_ids)
            labor_product_id = self.ensure_labor_product()
            if labor_product_id:
                self.models.execute_kw(self.db, self.uid, self.password,
                    'mrp.production', 'write',
                    [[int(mo_id)], {
                        'move_raw_ids': [(0, 0, {
                            'product_id': labor_product_id,
                            'product_uom_qty': duration_hours,
                            'price_unit': hourly_rate,
                            'name': f"Labor: {employee[0]['name']} - {description}",
                        })]
                    }])
                
            return True
        except Exception as e:
            print(f"Error recording labor: {e}")
            return False
