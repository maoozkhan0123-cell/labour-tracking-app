from app import create_app

app = create_app()

# Vercel needs the app variable to be exposed
if __name__ == '__main__':
    app.run()
