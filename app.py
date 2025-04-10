# app.py
from flask import Flask, render_template, request, redirect, url_for
from models import db, Item

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///game_assets.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

@app.before_first_request
def create_tables():
    db.create_all()

@app.route('/')
def index():
    items = Item.query.all()
    return render_template('index.html', items=items)

@app.route('/add', methods=['POST'])
def add_item():
    name = request.form.get('name')
    description = request.form.get('description')
    type_ = request.form.get('type')
    icon_url = request.form.get('icon_url')
    new_item = Item(name=name, description=description, type=type_, icon_url=icon_url)
    db.session.add(new_item)
    db.session.commit()
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True)
