# Georgia Tax Sale Listings Application

A comprehensive web application for viewing and analyzing Georgia tax sale property listings with interactive mapping and Street View integration.

## 🌟 Live Demo

**GitHub Pages:** [View Live Application](https://haginl1.github.io/Portfolio/TaxSale/)

## 📋 Features

- **PDF Parsing**: Automatically extracts property data from official county tax sale PDFs
- **Interactive Mapping**: Properties displayed on Leaflet maps with color-coded markers
- **Street View Integration**: Direct links to Google Street View for each property
- **Photo Preview**: Property photos rendered from official PDF documents using PDF.js
- **Geocoding**: Real-time address-to-coordinate conversion using OpenStreetMap
- **Multi-County Support**: Designed for Chatham County, GA with extensibility for other counties
- **Responsive Design**: Mobile-friendly interface with modern CSS styling

## 🛠️ Technology Stack

### Frontend
- **HTML5/CSS3/JavaScript** - Core web technologies
- **Leaflet.js** - Interactive mapping library
- **PDF.js** - Client-side PDF rendering and parsing
- **OpenStreetMap** - Map tiles and geocoding services

### Backend (Full Version)
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **pdf-parse** - Server-side PDF processing
- **node-fetch** - HTTP client for external APIs

## 🚀 Deployment Options

### Option 1: GitHub Pages (Demo Version)
- **URL**: `https://haginl1.github.io/Portfolio/TaxSale/`
- **Features**: Static demo with sample data
- **Limitations**: No live PDF parsing, limited to demo data

### Option 2: Full Application (Requires Server)
For the complete application with live data processing:

1. **Heroku**: Free tier with buildpacks
2. **Vercel**: Serverless functions for Node.js
3. **Netlify**: Functions for backend processing
4. **Railway**: Modern deployment platform
5. **DigitalOcean App Platform**: Container-based hosting

## 📁 Project Structure

```
TaxSale/
├── index.html              # GitHub Pages demo version
├── tax-sale-listings.html  # Full application (requires server)
├── server.js               # Node.js backend server
├── style.css               # Styling (shared)
├── package.json            # Dependencies
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Actions deployment
```

## 🔧 Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/haginl1/Portfolio.git
   cd Portfolio/TaxSale
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   node server.js
   ```

4. **Open in browser**:
   ```
   http://localhost:3001
   ```

## 📊 Sample Data

The demo includes sample properties from Chatham County, GA:
- **5 properties** with complete address information
- **3 properties** with photo availability
- **Real coordinates** for accurate mapping
- **Street View integration** for all properties

## 🗺️ Mapping Features

- **Color-coded markers**:
  - 🟢 Green: Properties with photos + exact coordinates
  - 🟡 Yellow: Properties with photos only
  - 🔵 Blue: Properties with exact coordinates only
  - 🟣 Purple: Properties with approximate coordinates

- **Interactive popups** with:
  - Property details (Parcel ID, Owner, Address)
  - Starting bid amount
  - Photo availability status
  - Direct Street View links

## 🔗 External Integrations

- **OpenStreetMap Nominatim**: Geocoding service for address-to-coordinate conversion
- **Google Street View**: Direct property visualization
- **Georgia County APIs**: Live PDF data sources (Chatham County)

## 📱 Responsive Design

- Mobile-optimized interface
- Touch-friendly map controls
- Scalable typography and spacing
- Cross-browser compatibility

## 🔒 Security Features

- Content Security Policy headers
- External link protection (`rel="noopener"`)
- Input validation and sanitization
- Rate limiting for API requests

## 📈 Performance Optimizations

- Lazy loading for PDF rendering
- Efficient marker clustering
- Optimized image scaling
- Minimal external dependencies

## 🧪 Testing

The application has been tested with:
- **Real data**: 85+ properties from Chatham County
- **Photo integration**: 82+ properties with available photos
- **Geocoding accuracy**: High success rate with OpenStreetMap
- **Cross-browser compatibility**: Chrome, Firefox, Safari, Edge

## 📧 Contact

**Developer**: Lisa Hagin  
**Portfolio**: [GitHub Profile](https://github.com/haginl1)  
**Email**: Available upon request

## 📄 License

This project is part of a professional portfolio demonstration. Please contact the developer for usage permissions.

---

**Note**: This application demonstrates proficiency in full-stack web development, API integration, mapping technologies, and modern deployment practices.
