import { Router } from 'express';
import LabTest from '../models/LaboratoryTest.js';

const router = Router();



router.post('/', async (req, res) => {
  try {
    const { testname, technicalname } = req.body;

    if (!testname || !technicalname) {
      return res.status(400).json({
        message: 'display_name and technical_name are required',
      });
    }
    const exist=await LabTest.findOne({testname:testname});
    if(exist){
        return res.status(409).json({
            message:"You already have that test registered",
            data:exist
        });
    }
    const test = await LabTest.create({
      testname,
      technicalname
    });

    return res.status(201).json(test);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A test with that display name already exists' });
    }
    console.error('Error creating test:', err.message);
    return res.status(500).json({ message: 'Failed to register test', error: err.message });
  }
});



router.get('/', async (req, res) => {
  try {
    const tests = await LabTest.find();
    return res.status(200).json({
        message:"Got the tests",
        data:tests
    });
  } catch (err) {
    console.error('Error fetching tests:', err.message);
    return res.status(500).json({ message: 'Failed to fetch tests' });
  }
});


router.get('/:id', async (req, res) => {
  try {
    const test = await LabTest.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    return res.json(test);
  } catch (err) {
    return res.status(404).json({ message: 'Test not found' });
  }
});


router.patch('/:id', async (req, res) => {
  try {
    const updated = await LabTest.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ message: 'Test not found' });
    return res.json(updated);
  } catch (err) {
    console.error('Error updating test:', err.message);
    return res.status(500).json({ message: 'Failed to update test' });
  }
});


router.delete('/:id', async (req, res) => {
  try {
    const deactivated = await LabTest.findByIdAndUpdate(
      req.params.id,
      { is_active: false },
      { new: true }
    );
    if (!deactivated) return res.status(404).json({ message: 'Test not found' });
    return res.json(deactivated);
  } catch (err) {
    console.error('Error deactivating test:', err.message);
    return res.status(500).json({ message: 'Failed to deactivate test' });
  }
});

export default router;