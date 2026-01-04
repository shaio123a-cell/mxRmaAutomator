import React, { useState } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Tabs, Tab, Box, Typography, List, ListItem, ListItemText, Divider, Stack } from '@mui/material'
import InfoIcon from '@mui/icons-material/Info'
import HelpIcon from '@mui/icons-material/Help'
import packageJson from '../../package.json'

// Logos
import BMCHelixLogo from '../../logo/BMCHelix Logo Medium Transparent.png'
import MatrixLogo from '../../logo/Matrix-Logo-Flat.png'
import MatrixKBLogo from '../../logo/MatrixKB for BMC Helix.png'

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function CustomTabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div role="tabpanel" hidden={value !== index} id={`help-tabpanel-${index}`} aria-labelledby={`help-tab-${index}`} {...other}>
            {value === index && (
                <Box sx={{ p: 2 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export default function HelpDialog({ open, onClose }: { open: boolean, onClose: () => void }) {
    const [tabValue, setTabValue] = useState(0);

    const handleChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Help & About</DialogTitle>
            <DialogContent sx={{ p: 0 }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleChange} aria-label="help tabs">
                        <Tab icon={<HelpIcon />} iconPosition="start" label="Guide" />
                        <Tab icon={<InfoIcon />} iconPosition="start" label="About" />
                    </Tabs>
                </Box>
                <CustomTabPanel value={tabValue} index={0}>
                    <Typography variant="h6" gutterBottom>How to use MatrixKB PATROL Scripting KM File Based Configuraiton Editor</Typography>
                    <List>
                        <ListItem>
                            <ListItemText
                                primary="1. Load Configuration"
                                secondary="Click 'Load Configuration File' to open your existing .cfg or .txt file containing device and script definitions."
                            />
                        </ListItem>
                        <Divider component="li" />
                        <ListItem>
                            <ListItemText
                                primary="2. Manage Devices"
                                secondary="Use the search bar to find devices. Click a device to view its scripts. Use the '+' button to add new devices. Use the edit icon to modify connection details."
                            />
                        </ListItem>
                        <Divider component="li" />
                        <ListItem>
                            <ListItemText
                                primary="3. Manage Scripts"
                                secondary="Select a device to see its scripts lists. Drag and drop to reorder execution priority. Click '+' to add new scripts."
                            />
                        </ListItem>
                        <Divider component="li" />
                        <ListItem>
                            <ListItemText
                                primary="4. Edit & Dry Run"
                                secondary="Click a script to edit its parameters (Path, Arguments, Regex). Use the 'Dry Run' button to test the command generation and execution (Electron app only). Dry Run shows the exact command that will be executed."
                            />
                        </ListItem>
                        <Divider component="li" />
                        <ListItem>
                            <ListItemText
                                primary="5. Save Changes"
                                secondary="Click 'Save Script' to apply changes to memory, then 'Save File' (implied via Save Dialog or Auto-Save flow) to write to disk. Backups are automatically created in a 'backups' subfolder."
                            />
                        </ListItem>
                    </List>
                </CustomTabPanel>
                <CustomTabPanel value={tabValue} index={1}>
                    <Stack spacing={3} alignItems="center" sx={{ py: 4 }}>
                        <img src={MatrixKBLogo} alt="MatrixKB" style={{ maxWidth: 200 }} />
                        <Typography variant="h5">FBCSKM Manager</Typography>
                        <Typography variant="body1">Version {packageJson.version}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            A comprehensive tool for managing File Based Configuration for BMC Helix / PATROL KM.
                        </Typography>
                        <Stack direction="row" spacing={3} alignItems="center" sx={{ mt: 2 }}>
                            <img src={MatrixLogo} alt="Matrix" style={{ height: 40 }} />
                            <img src={BMCHelixLogo} alt="BMC Helix" style={{ height: 40 }} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 4 }}>
                            © {new Date().getFullYear()} Matrix. All rights reserved.
                        </Typography>
                    </Stack>
                </CustomTabPanel>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    )
}
